import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (declared before importing the SUT) ───────────────────
const hoisted = vi.hoisted(() => ({
  sendAlertMock: vi.fn(async (_input: { level: string; subject: string; body: string }) => {}),
  getValidPinterestAccessTokenMock: vi.fn(async () => 'fake-access-token'),
  ulidCounter: { value: 0 },
}));

vi.mock('@rr/notifier', () => ({
  createNotifier: vi.fn(() => ({
    sendAlert: hoisted.sendAlertMock,
    sendDailyDigest: vi.fn(async () => {}),
  })),
}));

vi.mock('@rr/social-shared', async () => {
  const actual = await vi.importActual<typeof import('@rr/social-shared')>('@rr/social-shared');
  return {
    ...actual,
    ulid: () => `TEST_ULID_${String(++hoisted.ulidCounter.value).padStart(2, '0')}`,
  };
});

vi.mock('@rr/social-shared/platforms/pinterest-auth', () => ({
  getValidPinterestAccessToken: hoisted.getValidPinterestAccessTokenMock,
}));

import metrics from './metrics';
import { bucketFor, shouldSample } from './metrics.buckets';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// ── Bucket logic (pure) ────────────────────────────────────────────────

describe('metrics.buckets', () => {
  describe('bucketFor', () => {
    it('returns hourly for ages < 24h', () => {
      expect(bucketFor(0)).toBe('hourly');
      expect(bucketFor(HOUR)).toBe('hourly');
      expect(bucketFor(23 * HOUR)).toBe('hourly');
    });

    it('returns daily for 1-14 days', () => {
      expect(bucketFor(24 * HOUR)).toBe('daily');
      expect(bucketFor(7 * DAY)).toBe('daily');
      expect(bucketFor(14 * DAY - 1)).toBe('daily');
    });

    it('returns weekly for 14-90 days', () => {
      expect(bucketFor(14 * DAY)).toBe('weekly');
      expect(bucketFor(60 * DAY)).toBe('weekly');
      expect(bucketFor(90 * DAY - 1)).toBe('weekly');
    });

    it('returns skip at and beyond 90 days', () => {
      expect(bucketFor(90 * DAY)).toBe('skip');
      expect(bucketFor(365 * DAY)).toBe('skip');
    });
  });

  describe('shouldSample', () => {
    it('returns false for skip bucket regardless of last snapshot', () => {
      expect(shouldSample('skip', null)).toBe(false);
      expect(shouldSample('skip', Date.now())).toBe(false);
    });

    it('returns true when no prior snapshot exists', () => {
      expect(shouldSample('hourly', null)).toBe(true);
      expect(shouldSample('daily', null)).toBe(true);
      expect(shouldSample('weekly', null)).toBe(true);
    });

    it('hourly: requires >= 1h since last sample', () => {
      const now = Date.now();
      expect(shouldSample('hourly', now - 30 * 60 * 1000)).toBe(false);
      expect(shouldSample('hourly', now - HOUR)).toBe(true);
      expect(shouldSample('hourly', now - 2 * HOUR)).toBe(true);
    });

    it('daily: requires >= 24h since last sample', () => {
      const now = Date.now();
      expect(shouldSample('daily', now - 23 * HOUR)).toBe(false);
      expect(shouldSample('daily', now - DAY)).toBe(true);
    });

    it('weekly: requires >= 7d since last sample', () => {
      const now = Date.now();
      expect(shouldSample('weekly', now - 6 * DAY)).toBe(false);
      expect(shouldSample('weekly', now - 7 * DAY)).toBe(true);
    });
  });
});

// ── D1 mock helpers ────────────────────────────────────────────────────

interface CapturedSql {
  sql: string;
  bindings: unknown[];
}

interface PostJoinFixture {
  id: string;
  platform_post_id: string;
  published_at: number;
  last_snapshot_at: number | null;
}

interface ImpressionsRow {
  impressions: number;
}

interface DbStubOptions {
  candidates?: PostJoinFixture[];
  firstPinAtMs?: number | null;
  recentImpressions?: ImpressionsRow[];
  baselineImpressions?: ImpressionsRow[];
  attributionChanges?: number;
}

function makeDb(opts: DbStubOptions = {}) {
  const captured: CapturedSql[] = [];
  const batched: CapturedSql[][] = [];

  const stmt = (sql: string) => {
    let pendingBindings: unknown[] = [];
    const handle = {
      bind: (...bindings: unknown[]) => {
        pendingBindings = bindings;
        return handle;
      },
      run: async () => {
        captured.push({ sql, bindings: pendingBindings });
        if (sql.includes('INSERT INTO social_attribution')) {
          return {
            success: true,
            meta: { changes: opts.attributionChanges ?? 0 },
          } as unknown as D1Result;
        }
        return { success: true } as unknown as D1Result;
      },
      first: async <T>() => {
        captured.push({ sql, bindings: pendingBindings });
        if (sql.includes('MIN(published_at)')) {
          return { first: opts.firstPinAtMs ?? null } as unknown as T;
        }
        return null as unknown as T;
      },
      all: async <T>() => {
        captured.push({ sql, bindings: pendingBindings });
        if (sql.includes('FROM social_posts p') && sql.includes('platform_post_id')) {
          return { results: (opts.candidates ?? []) as unknown as T[] };
        }
        if (sql.includes('LIMIT 5')) {
          return { results: (opts.recentImpressions ?? []) as unknown as T[] };
        }
        if (
          sql.includes('JOIN social_metrics_snapshots') &&
          sql.includes('p.published_at >=')
        ) {
          return { results: (opts.baselineImpressions ?? []) as unknown as T[] };
        }
        return { results: [] as T[] };
      },
    };
    return handle;
  };

  return {
    db: {
      prepare: vi.fn((sql: string) => stmt(sql)),
      batch: vi.fn(async (statements: Array<ReturnType<typeof stmt>>) => {
        const group: CapturedSql[] = [];
        for (const s of statements) {
          await s.run();
          group.push(captured.pop()!);
        }
        batched.push(group);
        captured.push(...group);
        return [];
      }),
    } as unknown as D1Database,
    captured,
    batched,
  };
}

interface KvStub {
  ns: KVNamespace;
  store: Record<string, string | null>;
  putMock: ReturnType<typeof vi.fn>;
}

function makeKv(initial: Record<string, string | null> = {}): KvStub {
  const store: Record<string, string | null> = { ...initial };
  const putMock = vi.fn(async (key: string, value: string) => {
    store[key] = value;
  });
  const ns = {
    get: vi.fn(async (key: string) => store[key] ?? null),
    put: putMock,
    delete: vi.fn(async (key: string) => {
      delete store[key];
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
  return { ns, store, putMock };
}

interface CreateEnvOpts extends DbStubOptions {
  pinterestTokenBootstrapped?: boolean;
}

function createEnv(opts: CreateEnvOpts = {}) {
  const { db, captured, batched } = makeDb(opts);
  const killswitch = makeKv();
  const tokens = makeKv(
    opts.pinterestTokenBootstrapped
      ? {
          'pinterest:default': JSON.stringify({
            access_token: 'live',
            refresh_token: 'r',
            expires_at: Date.now() + 60_000,
          }),
        }
      : {},
  );
  const env = {
    DB: db,
    RR_SOCIAL_KILLSWITCH: killswitch.ns,
    RR_SOCIAL_TOKENS: tokens.ns,
    PINTEREST_CLIENT_ID: 'test-client-id',
    PINTEREST_CLIENT_SECRET: 'test-client-secret',
    NOTIFIER_FROM: 'social-bot@reduced.recipes',
    NOTIFIER_TO: 'ops@reduced.recipes',
    NOTIFIER_FROM_NAME: 'RR Social',
    NOTIFIER_CHANNEL: 'email' as const,
  };
  return { env, captured, batched, killswitch, tokens };
}

function triggerRequest(): Request {
  return new Request('http://localhost/trigger', { method: 'POST' });
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.sendAlertMock.mockClear();
  hoisted.getValidPinterestAccessTokenMock.mockClear();
  hoisted.getValidPinterestAccessTokenMock.mockResolvedValue('fake-access-token');
  hoisted.ulidCounter.value = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── Worker behaviour ───────────────────────────────────────────────────

describe('social-metrics worker', () => {
  describe('snapshot pass', () => {
    it('skips entirely when no Pinterest token is bootstrapped', async () => {
      const { env, captured } = createEnv({
        pinterestTokenBootstrapped: false,
      });

      const response = await metrics.fetch(triggerRequest(), env);
      const body = (await response.json()) as { snapshots: number };

      expect(response.status).toBe(200);
      expect(body.snapshots).toBe(0);

      // No Pinterest token fetch, no analytics fetch, no candidates query.
      expect(hoisted.getValidPinterestAccessTokenMock).not.toHaveBeenCalled();
      expect(fetchMock).not.toHaveBeenCalled();
      const candidatesQuery = captured.find(
        (c) => c.sql.includes('FROM social_posts p') && c.sql.includes('platform_post_id'),
      );
      expect(candidatesQuery).toBeUndefined();
    });

    it('snapshots a due post with the lifetime metrics shape', async () => {
      const ageMs = 6 * HOUR; // hourly bucket, no prior snapshot -> due
      fetchMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            all: {
              lifetime_metrics: {
                IMPRESSION: 200,
                SAVE: 5,
                OUTBOUND_CLICK: 12,
                VIDEO_MRC_VIEW: 0,
                VIDEO_AVG_WATCH_TIME: 0,
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );

      const { env, captured } = createEnv({
        pinterestTokenBootstrapped: true,
        candidates: [
          {
            id: 'POST_A',
            platform_post_id: 'PIN_A',
            published_at: Date.now() - ageMs,
            last_snapshot_at: null,
          },
        ],
      });

      const response = await metrics.fetch(triggerRequest(), env);
      const body = (await response.json()) as { snapshots: number };

      expect(body.snapshots).toBe(1);
      expect(hoisted.getValidPinterestAccessTokenMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Pinterest URL + auth header.
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(String(url)).toContain('https://api.pinterest.com/v5/pins/PIN_A/analytics');
      expect(String(url)).toContain('metric_types=IMPRESSION');
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer fake-access-token');

      // Insert into social_metrics_snapshots with the lifetime values.
      const insert = captured.find(
        (c) => c.sql.includes('INSERT INTO social_metrics_snapshots'),
      );
      expect(insert).toBeDefined();
      // Bind order: id, post_id, captured_at, age_hours, impressions, reach,
      // saves, click_throughs, video_views, video_avg_watch_seconds, likes,
      // comments, shares.
      expect(String(insert!.bindings[0])).toMatch(/^TEST_ULID_\d{2}$/);
      expect(insert!.bindings[1]).toBe('POST_A');
      expect(typeof insert!.bindings[2]).toBe('number');
      expect(insert!.bindings[3]).toBe(6); // age_hours
      expect(insert!.bindings[4]).toBe(200); // impressions
      expect(insert!.bindings[5]).toBeNull(); // reach (Pinterest doesn't return REACH on lifetime)
      expect(insert!.bindings[6]).toBe(5); // saves
      expect(insert!.bindings[7]).toBe(12); // click_throughs (OUTBOUND_CLICK)
      expect(insert!.bindings[8]).toBe(0); // video_views
      expect(insert!.bindings[9]).toBe(0); // video_avg_watch_seconds
      // likes/comments/shares always null on Pinterest path.
      expect(insert!.bindings[10]).toBeNull();
      expect(insert!.bindings[11]).toBeNull();
      expect(insert!.bindings[12]).toBeNull();
    });

    it('survives a per-post fetch failure (one bad pin doesn\'t kill the pass)', async () => {
      // Two candidates: first throws, second succeeds.
      fetchMock
        .mockResolvedValueOnce(new Response('bad pin', { status: 404 }))
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({ all: { lifetime_metrics: { IMPRESSION: 50 } } }),
            { status: 200 },
          ),
        );

      const { env, captured } = createEnv({
        pinterestTokenBootstrapped: true,
        candidates: [
          {
            id: 'POST_BAD',
            platform_post_id: 'PIN_BAD',
            published_at: Date.now() - 2 * HOUR,
            last_snapshot_at: null,
          },
          {
            id: 'POST_OK',
            platform_post_id: 'PIN_OK',
            published_at: Date.now() - 2 * HOUR,
            last_snapshot_at: null,
          },
        ],
      });

      const response = await metrics.fetch(triggerRequest(), env);
      const body = (await response.json()) as { snapshots: number };

      expect(body.snapshots).toBe(1);
      const inserts = captured.filter((c) =>
        c.sql.includes('INSERT INTO social_metrics_snapshots'),
      );
      expect(inserts).toHaveLength(1);
      expect(inserts[0]!.bindings[1]).toBe('POST_OK');
    });

    it('skips posts whose bucket says not-due', async () => {
      // Recently snapshotted hourly post; no fetch should fire.
      const { env } = createEnv({
        pinterestTokenBootstrapped: true,
        candidates: [
          {
            id: 'POST_RECENT',
            platform_post_id: 'PIN_RECENT',
            published_at: Date.now() - 6 * HOUR,
            last_snapshot_at: Date.now() - 10 * 60 * 1000, // 10 min ago
          },
        ],
      });

      await metrics.fetch(triggerRequest(), env);

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('attribution rollup', () => {
    it('emits the GROUP-BY insert with strftime date and 7-day lookback', async () => {
      const { env, captured } = createEnv({
        pinterestTokenBootstrapped: false,
        attributionChanges: 3,
      });

      const response = await metrics.fetch(triggerRequest(), env);
      const body = (await response.json()) as { attributionRows: number };

      expect(body.attributionRows).toBe(3);

      const insert = captured.find(
        (c) => c.sql.includes('INSERT INTO social_attribution'),
      );
      expect(insert).toBeDefined();

      // SQL shape: covers join, group-by, conflict update, randomblob id.
      expect(insert!.sql).toContain('FROM social_shortlink_hits h');
      expect(insert!.sql).toContain('JOIN social_drafts d ON d.id = h.draft_id');
      expect(insert!.sql).toContain('JOIN social_posts p ON p.draft_id = d.id');
      expect(insert!.sql).toContain("strftime('%Y-%m-%d', h.hit_at / 1000, 'unixepoch')");
      expect(insert!.sql).toContain('GROUP BY p.id, date');
      expect(insert!.sql).toContain('ON CONFLICT(post_id, date) DO UPDATE SET sessions = excluded.sessions');
      expect(insert!.sql).toContain('lower(hex(randomblob(16)))');

      // 7-day lookback in ms.
      expect(insert!.bindings).toHaveLength(1);
      const sevenDaysMs = 7 * 86_400_000;
      const cutoff = insert!.bindings[0] as number;
      expect(typeof cutoff).toBe('number');
      expect(Date.now() - cutoff).toBeGreaterThanOrEqual(sevenDaysMs - 1000);
      expect(Date.now() - cutoff).toBeLessThanOrEqual(sevenDaysMs + 1000);
    });
  });

  describe('day-30+ killswitch', () => {
    it('does not trip when first pin was less than 30 days ago', async () => {
      const { env, killswitch } = createEnv({
        pinterestTokenBootstrapped: false,
        firstPinAtMs: Date.now() - 10 * DAY,
        recentImpressions: [
          { impressions: 1 },
          { impressions: 1 },
          { impressions: 1 },
          { impressions: 1 },
          { impressions: 1 },
        ],
        baselineImpressions: [{ impressions: 1000 }, { impressions: 1000 }],
      });

      await metrics.fetch(triggerRequest(), env);

      expect(killswitch.putMock).not.toHaveBeenCalled();
      expect(hoisted.sendAlertMock).not.toHaveBeenCalled();
    });

    it('does not trip when fewer than 5 recent posts have snapshots', async () => {
      const { env, killswitch } = createEnv({
        pinterestTokenBootstrapped: false,
        firstPinAtMs: Date.now() - 60 * DAY,
        recentImpressions: [
          { impressions: 1 },
          { impressions: 1 },
          { impressions: 1 },
          { impressions: 1 },
        ], // only 4
        baselineImpressions: [
          { impressions: 1000 },
          { impressions: 800 },
          { impressions: 1200 },
        ],
      });

      await metrics.fetch(triggerRequest(), env);

      expect(killswitch.putMock).not.toHaveBeenCalled();
      expect(hoisted.sendAlertMock).not.toHaveBeenCalled();
    });

    it('trips and alerts when recent median < 10% of trailing 30-day median', async () => {
      const { env, killswitch } = createEnv({
        pinterestTokenBootstrapped: false,
        firstPinAtMs: Date.now() - 60 * DAY,
        // recent median = 5
        recentImpressions: [
          { impressions: 1 },
          { impressions: 3 },
          { impressions: 5 },
          { impressions: 7 },
          { impressions: 9 },
        ],
        // baseline median = 100
        baselineImpressions: [
          { impressions: 50 },
          { impressions: 75 },
          { impressions: 100 },
          { impressions: 200 },
          { impressions: 300 },
        ],
      });

      await metrics.fetch(triggerRequest(), env);

      expect(killswitch.putMock).toHaveBeenCalledTimes(1);
      const [key, value] = killswitch.putMock.mock.calls[0]!;
      expect(key).toBe('pinterest');
      expect(String(value)).toContain('day-30+ rolling');
      expect(String(value)).toContain('recent median 5');
      expect(String(value)).toContain('baseline 100');

      expect(hoisted.sendAlertMock).toHaveBeenCalledTimes(1);
      const alert = hoisted.sendAlertMock.mock.calls[0]![0];
      expect(alert.level).toBe('warn');
      expect(alert.subject).toContain('killswitch');
      expect(alert.subject.toLowerCase()).toContain('rolling');
      expect(alert.body).toContain('5');
      expect(alert.body).toContain('100');
    });

    it('does not trip when recent median is at or above 10% of baseline', async () => {
      const { env, killswitch } = createEnv({
        pinterestTokenBootstrapped: false,
        firstPinAtMs: Date.now() - 60 * DAY,
        // recent median = 15 (>= 10% of 100)
        recentImpressions: [
          { impressions: 10 },
          { impressions: 12 },
          { impressions: 15 },
          { impressions: 18 },
          { impressions: 20 },
        ],
        baselineImpressions: [
          { impressions: 50 },
          { impressions: 100 },
          { impressions: 150 },
        ],
      });

      await metrics.fetch(triggerRequest(), env);

      expect(killswitch.putMock).not.toHaveBeenCalled();
      expect(hoisted.sendAlertMock).not.toHaveBeenCalled();
    });
  });

  describe('prune pass', () => {
    it('runs three deletes in a single batch with the right retention windows', async () => {
      const { env, batched } = createEnv({ pinterestTokenBootstrapped: false });

      await metrics.fetch(triggerRequest(), env);

      expect(batched).toHaveLength(1);
      const group = batched[0]!;
      expect(group).toHaveLength(3);

      const searchHitsDelete = group.find((s) =>
        s.sql.includes('DELETE FROM social_search_hits'),
      );
      expect(searchHitsDelete).toBeDefined();
      expect(searchHitsDelete!.sql).toContain("'-30 days'");

      const orchRunsDelete = group.find((s) =>
        s.sql.includes('DELETE FROM social_orchestrator_runs'),
      );
      expect(orchRunsDelete).toBeDefined();
      const ninetyDaysMs = 90 * 86_400_000;
      const orchCutoff = orchRunsDelete!.bindings[0] as number;
      expect(typeof orchCutoff).toBe('number');
      expect(Date.now() - orchCutoff).toBeGreaterThanOrEqual(ninetyDaysMs - 1000);
      expect(Date.now() - orchCutoff).toBeLessThanOrEqual(ninetyDaysMs + 1000);

      const shortlinkHitsDelete = group.find((s) =>
        s.sql.includes('DELETE FROM social_shortlink_hits'),
      );
      expect(shortlinkHitsDelete).toBeDefined();
      const shortCutoff = shortlinkHitsDelete!.bindings[0] as number;
      expect(typeof shortCutoff).toBe('number');
      expect(Date.now() - shortCutoff).toBeGreaterThanOrEqual(ninetyDaysMs - 1000);
      expect(Date.now() - shortCutoff).toBeLessThanOrEqual(ninetyDaysMs + 1000);
    });
  });

  describe('routing', () => {
    it('returns 200 OK on GET /health', async () => {
      const { env } = createEnv();
      const response = await metrics.fetch(
        new Request('http://localhost/health'),
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    it('returns 404 for unknown paths', async () => {
      const { env } = createEnv();
      const response = await metrics.fetch(
        new Request('http://localhost/unknown'),
        env,
      );
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /trigger (only POST allowed)', async () => {
      const { env } = createEnv();
      const response = await metrics.fetch(
        new Request('http://localhost/trigger'),
        env,
      );
      expect(response.status).toBe(404);
    });
  });
});
