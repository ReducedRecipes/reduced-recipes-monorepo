import { ulid, assetUrl } from '@rr/social-shared';
import { getValidPinterestAccessToken } from '@rr/social-shared/platforms/pinterest-auth';
import { createNotifier } from '@rr/notifier';

/**
 * Cron-triggered publisher for scheduled Pinterest drafts (ticket 009 / spec §24).
 *
 * Order of operations:
 *   1. Killswitch check -- abort before any Pinterest API call
 *   2. Daily cap (warm-up rule §7.1: 2/day for first 14 days, 5/day thereafter)
 *   3. Pull due drafts (`status='scheduled' AND scheduled_for <= now`)
 *   4. Publish each via POST /v5/pins (5xx retried with backoff, 4xx fails fast)
 *   5. Bootstrap engagement floor (days 1-30): trip killswitch if last 3 pins
 *      each have <50 impressions
 */

interface Env {
  DB: D1Database;
  RR_SOCIAL_KILLSWITCH: KVNamespace;
  RR_SOCIAL_TOKENS: KVNamespace;
  PINTEREST_CLIENT_ID: string;
  PINTEREST_CLIENT_SECRET: string;
  PINTEREST_DEFAULT_BOARD_ID: string;
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
  NOTIFIER_CHANNEL?: 'email';
}

interface DraftRow {
  id: string;
  source_id: string;
  caption: string;
  hashtags: string;
  cta_url: string;
  asset_r2_keys: string;
}

interface RunResult {
  published: number;
  failed: number;
  skipped: number;
}

const KILLSWITCH_KEY = 'pinterest';
const DAY_MS = 86_400_000;
const WARMUP_DAYS = 14;
const WARMUP_CAP = 2;
const STEADY_CAP = 5;
const BOOTSTRAP_WINDOW_DAYS = 30;
const BOOTSTRAP_LOOKBACK_DAYS = 3;
const BOOTSTRAP_MIN_IMPRESSIONS = 50;
const BOOTSTRAP_MIN_PINS = 3;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000];

async function run(env: Env): Promise<RunResult> {
  const runId = ulid();

  const ks = await env.RR_SOCIAL_KILLSWITCH.get(KILLSWITCH_KEY);
  if (ks) {
    console.log(`SOCIAL_PUBLISHER_PINTEREST ${runId}: killswitch (${ks}); skipping`);
    return { published: 0, failed: 0, skipped: 0 };
  }

  // UTC day boundary -- cap counts published_at >= midnight UTC today.
  const todayMs = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const todayPublished = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM social_posts WHERE platform = 'pinterest' AND published_at >= ?`,
  ).bind(todayMs).first<{ n: number }>();

  const dayCount = await daysSinceFirstPin(env);
  const cap = dayCount < WARMUP_DAYS ? WARMUP_CAP : STEADY_CAP;
  const publishedToday = todayPublished?.n ?? 0;

  if (publishedToday >= cap) {
    console.log(
      `SOCIAL_PUBLISHER_PINTEREST ${runId}: daily cap (${cap}) reached; published=${publishedToday}`,
    );
    return { published: 0, failed: 0, skipped: 0 };
  }
  const remainingCap = cap - publishedToday;

  const due = await env.DB.prepare(
    `SELECT id, source_id, caption, hashtags, cta_url, asset_r2_keys
     FROM social_drafts
     WHERE platform = 'pinterest' AND status = 'scheduled' AND scheduled_for <= ?
     ORDER BY scheduled_for ASC LIMIT ?`,
  ).bind(Date.now(), remainingCap).all<DraftRow>();

  let published = 0;
  let failed = 0;
  for (const draft of due.results) {
    try {
      await publishOne(env, draft);
      published++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `SOCIAL_PUBLISHER_PINTEREST ${runId}: draft ${draft.id} failed: ${message}`,
      );
      await markFailed(env, draft.id, message);
      await createNotifier(env).sendAlert({
        level: 'error',
        subject: `Pinterest publish failed: ${draft.id}`,
        body: `Run id: ${runId}\nDraft id: ${draft.id}\nError: ${message}`,
      });
      failed++;
    }
  }

  await maybeTripBootstrapKillswitch(env, runId);
  return { published, failed, skipped: 0 };
}

async function publishOne(env: Env, draft: DraftRow): Promise<void> {
  const token = await getValidPinterestAccessToken(env);

  // asset_r2_keys is a JSON array; the adapter writes [heroR2Key, pinR2Key] for
  // Pinterest -- prefer the 1000x1500 pin shot at index 1, fall back to [0].
  const assetKeys = JSON.parse(draft.asset_r2_keys) as string[];
  const pinR2Key = assetKeys[1] ?? assetKeys[0];
  if (!pinR2Key) {
    throw new Error(`draft ${draft.id} has no asset_r2_keys`);
  }
  const imageUrl = assetUrl(pinR2Key);

  const hashtags = JSON.parse(draft.hashtags) as string[];
  const description = [draft.caption, hashtags.join(' ')]
    .filter((s) => s && s.length > 0)
    .join('\n\n');

  const r = await fetchWithRetry('https://api.pinterest.com/v5/pins', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      board_id: env.PINTEREST_DEFAULT_BOARD_ID,
      description,
      link: draft.cta_url,
      media_source: { source_type: 'image_url', url: imageUrl },
    }),
  });

  if (!r.ok) {
    const body = await r.text();
    if (r.status >= 400 && r.status < 500) {
      throw new Error(`Pinterest 4xx: ${r.status} ${body}`);
    }
    throw new Error(`Pinterest 5xx after retries: ${r.status} ${body}`);
  }

  const j = (await r.json()) as { id: string };
  const postId = ulid();
  const now = Date.now();

  // Atomic-ish: one batch keeps social_posts row + draft status flip aligned.
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO social_posts (id, draft_id, platform, platform_post_id, permalink, short_link, published_at)
       VALUES (?, ?, 'pinterest', ?, ?, ?, ?)`,
    ).bind(
      postId,
      draft.id,
      j.id,
      `https://www.pinterest.com/pin/${j.id}/`,
      draft.cta_url,
      now,
    ),
    env.DB.prepare(
      `UPDATE social_drafts SET status = 'published' WHERE id = ?`,
    ).bind(draft.id),
  ]);
}

/**
 * Retry on 5xx and network errors (3 attempts: 30s, 2m, 10m). 4xx returns
 * immediately so the caller can mark the draft failed without retrying a
 * malformed payload.
 */
async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  let last: Response | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      last = await fetch(url, init);
      if (last.ok) return last;
      if (last.status >= 400 && last.status < 500) return last;
    } catch (err) {
      // Network error -- treat like 5xx (retry).
      if (attempt === RETRY_DELAYS_MS.length) throw err;
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }
  return last as Response;
}

const sleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function markFailed(env: Env, draftId: string, message: string): Promise<void> {
  await env.DB.prepare(
    `UPDATE social_drafts SET status = 'failed', rejection_reason = ? WHERE id = ?`,
  ).bind(message.slice(0, 500), draftId).run();
}

async function daysSinceFirstPin(env: Env): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT MIN(published_at) AS first FROM social_posts WHERE platform = 'pinterest'`,
  ).first<{ first: number | null }>();
  if (!row?.first) return 0;
  return Math.floor((Date.now() - row.first) / DAY_MS);
}

/**
 * Bootstrap engagement floor (§24): during the first 30 days after the first
 * pin, if the most recent 3 pinterest posts in the last 3 days each show <50
 * impressions, set the killswitch and alert ops. Doesn't run after day 30+.
 */
async function maybeTripBootstrapKillswitch(env: Env, runId: string): Promise<void> {
  const days = await daysSinceFirstPin(env);
  if (days >= BOOTSTRAP_WINDOW_DAYS) return;

  const since = Date.now() - BOOTSTRAP_LOOKBACK_DAYS * DAY_MS;
  const recent = await env.DB.prepare(
    `SELECT p.id AS id, COALESCE(MAX(s.impressions), 0) AS impressions
     FROM social_posts p
     LEFT JOIN social_metrics_snapshots s ON s.post_id = p.id
     WHERE p.platform = 'pinterest' AND p.published_at >= ?
     GROUP BY p.id
     ORDER BY p.published_at DESC LIMIT ?`,
  ).bind(since, BOOTSTRAP_MIN_PINS).all<{ id: string; impressions: number }>();

  if (recent.results.length < BOOTSTRAP_MIN_PINS) return;
  if (recent.results.every((r) => r.impressions < BOOTSTRAP_MIN_IMPRESSIONS)) {
    const reason = `bootstrap floor: last ${BOOTSTRAP_MIN_PINS} pins <${BOOTSTRAP_MIN_IMPRESSIONS} impressions`;
    await env.RR_SOCIAL_KILLSWITCH.put(KILLSWITCH_KEY, reason);
    await createNotifier(env).sendAlert({
      level: 'warn',
      subject: 'Pinterest killswitch tripped (bootstrap floor)',
      body:
        `Run id: ${runId}\n` +
        `Reason: ${reason}\n\n` +
        `Last 3 pins each had <${BOOTSTRAP_MIN_IMPRESSIONS} impressions. ` +
        `Killswitch set on RR_SOCIAL_KILLSWITCH:${KILLSWITCH_KEY}. ` +
        `Review and clear via wrangler kv key delete.`,
    });
  }
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
