import { ulid } from '@rr/social-shared';
import { getValidPinterestAccessToken } from '@rr/social-shared/platforms/pinterest-auth';
import { createNotifier } from '@rr/notifier';
import { bucketFor, shouldSample } from './metrics.buckets';

/**
 * Hourly cron worker (ticket 012 / spec §27) that closes the metrics loop:
 *   1. Pinterest analytics snapshots for posts <= 90 days old, cadence by bucket
 *   2. Daily attribution rollup from social_shortlink_hits -> social_attribution
 *   3. Day-30+ rolling killswitch (recent median impressions < 10% of baseline)
 *   4. Pruning of observability tables (search hits, orchestrator runs, shortlink hits)
 *
 * Token absence is handled gracefully -- we no-op the snapshot pass instead of
 * throwing, so the attribution + prune passes still run during bootstrap.
 */

interface Env {
  DB: D1Database;
  RR_SOCIAL_KILLSWITCH: KVNamespace;
  RR_SOCIAL_TOKENS: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
  NOTIFIER_CHANNEL?: 'email';
}

interface PostJoin {
  id: string;
  platform_post_id: string;
  published_at: number;
  last_snapshot_at: number | null;
}

interface RunResult {
  snapshots: number;
  attributionRows: number;
}

const DAY_MS = 86_400_000;
const SNAPSHOT_LOOKBACK_DAYS = 90;
const ATTRIBUTION_LOOKBACK_DAYS = 7;
const KILLSWITCH_GATE_DAYS = 30;
const KILLSWITCH_MIN_RECENT_POSTS = 5;
const KILLSWITCH_TRIP_RATIO = 0.1; // recent median < 10% of baseline
const SEARCH_HIT_RETENTION_DAYS = 30;
const ORCH_RUN_RETENTION_DAYS = 90;
const SHORTLINK_HIT_RETENTION_DAYS = 90;

async function run(env: Env): Promise<RunResult> {
  const snapshots = await snapshotPinterest(env);
  const attributionRows = await rollUpAttribution(env);
  await maybeTripDay30Killswitch(env);
  await prune(env);
  return { snapshots, attributionRows };
}

async function snapshotPinterest(env: Env): Promise<number> {
  // No bootstrapped token -> nothing to do. Keep silent: this is the normal
  // pre-OAuth state and we don't want a wall of warnings during early ops.
  const tokenStored = await env.RR_SOCIAL_TOKENS.get('pinterest:default');
  if (!tokenStored) return 0;

  const token = await getValidPinterestAccessToken(env);

  // Last snapshot per post is computed inline so we can decide cadence
  // without a second round-trip per row.
  const candidates = await env.DB.prepare(
    `SELECT p.id, p.platform_post_id, p.published_at,
            (SELECT MAX(captured_at) FROM social_metrics_snapshots WHERE post_id = p.id) AS last_snapshot_at
     FROM social_posts p
     WHERE p.platform = 'pinterest' AND p.published_at >= ?`,
  ).bind(Date.now() - SNAPSHOT_LOOKBACK_DAYS * DAY_MS).all<PostJoin>();

  let n = 0;
  for (const row of candidates.results) {
    const age = Date.now() - row.published_at;
    const bucket = bucketFor(age);
    if (!shouldSample(bucket, row.last_snapshot_at)) continue;

    try {
      const stats = await fetchPinAnalytics(token, row.platform_post_id);
      await env.DB.prepare(
        `INSERT INTO social_metrics_snapshots
           (id, post_id, captured_at, age_hours, impressions, reach, saves, click_throughs,
            video_views, video_avg_watch_seconds, likes, comments, shares)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ulid(),
        row.id,
        Date.now(),
        Math.floor(age / (60 * 60 * 1000)),
        stats.impressions ?? null,
        stats.reach ?? null,
        stats.saves ?? null,
        stats.outbound_click ?? null,
        stats.video_view ?? null,
        stats.video_avg_watch_time ?? null,
        null,
        null,
        null,
      ).run();
      n++;
    } catch (err) {
      // One bad pin shouldn't kill the whole snapshot pass.
      console.warn(`SOCIAL_METRICS: snapshot failed for post ${row.id}:`, err);
    }
  }
  return n;
}

interface PinterestPinStats {
  impressions?: number | undefined;
  reach?: number | undefined;
  saves?: number | undefined;
  outbound_click?: number | undefined;
  video_view?: number | undefined;
  video_avg_watch_time?: number | undefined;
}

/**
 * Pulls cumulative ("lifetime") metrics for a single pin. Snapshots store the
 * raw lifetime numbers; the analytics dashboard subtracts adjacent snapshots
 * to derive deltas -- not this worker's job.
 */
async function fetchPinAnalytics(token: string, pinId: string): Promise<PinterestPinStats> {
  const url = new URL(`https://api.pinterest.com/v5/pins/${pinId}/analytics`);
  url.searchParams.set('start_date', dateAgo(90));
  url.searchParams.set('end_date', dateAgo(0));
  url.searchParams.set(
    'metric_types',
    'IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK,VIDEO_MRC_VIEW,VIDEO_AVG_WATCH_TIME',
  );
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) {
    throw new Error(`Pinterest analytics ${r.status}: ${await r.text()}`);
  }
  const j = (await r.json()) as { all?: { lifetime_metrics?: Record<string, number> } };
  const m = j.all?.lifetime_metrics ?? {};
  return {
    impressions: m.IMPRESSION,
    saves: m.SAVE,
    outbound_click: m.OUTBOUND_CLICK,
    video_view: m.VIDEO_MRC_VIEW,
    video_avg_watch_time: m.VIDEO_AVG_WATCH_TIME,
  };
}

function dateAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Daily session-count rollup. Looks back 7 days on shortlink hits so recent
 * days get refreshed (corrections from late-arriving hits) without
 * re-aggregating ancient history each hour.
 *
 * `lower(hex(randomblob(16)))` mints a fresh 32-char id per row inside SQLite,
 * which avoids needing the worker to ulid()-mint every row. The ON CONFLICT
 * clause keeps `(post_id, date)` unique and overwrites `sessions` so the row
 * for "today" trends up as more hits arrive.
 */
async function rollUpAttribution(env: Env): Promise<number> {
  const result = await env.DB.prepare(
    `INSERT INTO social_attribution (id, post_id, date, sessions, installs, signups)
     SELECT
       lower(hex(randomblob(16))) AS id,
       p.id AS post_id,
       strftime('%Y-%m-%d', h.hit_at / 1000, 'unixepoch') AS date,
       COUNT(*) AS sessions, 0 AS installs, 0 AS signups
     FROM social_shortlink_hits h
     JOIN social_drafts d ON d.id = h.draft_id
     JOIN social_posts p ON p.draft_id = d.id
     WHERE h.hit_at >= ?
     GROUP BY p.id, date
     ON CONFLICT(post_id, date) DO UPDATE SET sessions = excluded.sessions`,
  ).bind(Date.now() - ATTRIBUTION_LOOKBACK_DAYS * DAY_MS).run();
  return result.meta?.changes ?? 0;
}

/**
 * Rolling baseline killswitch (§7.2). Only runs once we have >=30 days of
 * pinning history and >=5 recent posts to compare against. Trips when the
 * 5-most-recent posts' median lifetime impressions fall below 10% of the
 * 30-day median. `MAX(s.impressions)` per post = most recent snapshot's
 * cumulative number for that post.
 */
async function maybeTripDay30Killswitch(env: Env): Promise<void> {
  const first = await env.DB.prepare(
    `SELECT MIN(published_at) AS first FROM social_posts WHERE platform = 'pinterest'`,
  ).first<{ first: number | null }>();
  if (!first?.first || (Date.now() - first.first) < KILLSWITCH_GATE_DAYS * DAY_MS) return;

  const recent = await env.DB.prepare(
    `SELECT MAX(s.impressions) AS impressions
     FROM social_posts p
     JOIN social_metrics_snapshots s ON s.post_id = p.id
     WHERE p.platform = 'pinterest'
     GROUP BY p.id ORDER BY MAX(p.published_at) DESC LIMIT 5`,
  ).all<{ impressions: number }>();

  const baseline = await env.DB.prepare(
    `SELECT MAX(s.impressions) AS impressions
     FROM social_posts p
     JOIN social_metrics_snapshots s ON s.post_id = p.id
     WHERE p.platform = 'pinterest' AND p.published_at >= ?
     GROUP BY p.id`,
  ).bind(Date.now() - KILLSWITCH_GATE_DAYS * DAY_MS).all<{ impressions: number }>();

  const recentMedian = median(recent.results.map((r) => r.impressions));
  const baselineMedian = median(baseline.results.map((r) => r.impressions));
  if (
    recent.results.length >= KILLSWITCH_MIN_RECENT_POSTS &&
    baselineMedian > 0 &&
    recentMedian < baselineMedian * KILLSWITCH_TRIP_RATIO
  ) {
    const reason = `day-30+ rolling: recent median ${recentMedian} < 10% of baseline ${baselineMedian}`;
    await env.RR_SOCIAL_KILLSWITCH.put('pinterest', reason);
    await createNotifier(env).sendAlert({
      level: 'warn',
      subject: 'Pinterest killswitch tripped (rolling baseline)',
      body: `Recent 5-post median: ${recentMedian}. 30-day median: ${baselineMedian}.`,
    });
  }
}

/** median([]) -> 0; median([1,2,3]) -> 2; median([1,2,3,4]) -> 2.5 */
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Atomic prune of observability tables. D1 deletes are cheap so this runs
 * unconditionally every cron tick.
 *   - search_hits:    keep last 30d (purely a hot-ranking signal; spec §10)
 *   - orchestrator_runs: keep last 90d (debug breadcrumbs for selector runs)
 *   - shortlink_hits: keep last 90d (already aggregated into attribution)
 */
async function prune(env: Env): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM social_search_hits WHERE date < strftime('%Y-%m-%d', 'now', '-${SEARCH_HIT_RETENTION_DAYS} days')`,
    ),
    env.DB.prepare(`DELETE FROM social_orchestrator_runs WHERE started_at < ?`).bind(
      Date.now() - ORCH_RUN_RETENTION_DAYS * DAY_MS,
    ),
    env.DB.prepare(`DELETE FROM social_shortlink_hits WHERE hit_at < ?`).bind(
      Date.now() - SHORTLINK_HIT_RETENTION_DAYS * DAY_MS,
    ),
  ]);
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): void {
    ctx.waitUntil(run(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try {
        return Response.json(await run(env));
      } catch (err) {
        return new Response((err as Error).message, { status: 500 });
      }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
