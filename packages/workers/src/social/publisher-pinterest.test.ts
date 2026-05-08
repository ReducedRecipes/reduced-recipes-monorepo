import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Module mocks (must be declared before importing the SUT) ───────────
// `vi.mock` calls are hoisted, so any state they capture must be
// declared via `vi.hoisted` to also hoist.

const hoisted = vi.hoisted(() => {
  return {
    sendAlertMock: vi.fn(async (_input: { level: string; subject: string; body: string }) => {}),
    getValidPinterestAccessTokenMock: vi.fn(async () => 'fake-access-token'),
    ulidCounter: { value: 0 },
  };
});
const sendAlertMock = hoisted.sendAlertMock;
const getValidPinterestAccessTokenMock = hoisted.getValidPinterestAccessTokenMock;

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
    ulid: () => `TEST_POST_${String(++hoisted.ulidCounter.value).padStart(2, '0')}`,
  };
});

vi.mock('@rr/social-shared/platforms/pinterest-auth', () => ({
  getValidPinterestAccessToken: hoisted.getValidPinterestAccessTokenMock,
}));

import publisher from './publisher-pinterest';

// ── D1 mock helpers ────────────────────────────────────────────────────

interface CapturedSql { sql: string; bindings: unknown[] }

interface DraftRowFixture {
  id: string;
  source_id: string;
  caption: string;
  hashtags: string;
  cta_url: string;
  asset_r2_keys: string;
}

interface MetricsRow { id: string; impressions: number }

interface DbStubOptions {
  todayPinterestCount?: number;
  firstPinAtMs?: number | null;
  dueDrafts?: DraftRowFixture[];
  bootstrapWindowMetrics?: MetricsRow[];
}

function makeDb(opts: DbStubOptions = {}) {
  const captured: CapturedSql[] = [];
  const batched: CapturedSql[][] = [];
  let dueDelivered = false;

  const stmt = (sql: string) => {
    let pendingBindings: unknown[] = [];

    const handle = {
      bind: (...bindings: unknown[]) => {
        pendingBindings = bindings;
        return handle;
      },
      run: async () => {
        captured.push({ sql, bindings: pendingBindings });
        return { success: true } as unknown as D1Result;
      },
      first: async <T>() => {
        captured.push({ sql, bindings: pendingBindings });
        if (sql.includes('COUNT(*)') && sql.includes('social_posts')) {
          return { n: opts.todayPinterestCount ?? 0 } as unknown as T;
        }
        if (sql.includes('MIN(published_at)')) {
          return { first: opts.firstPinAtMs ?? null } as unknown as T;
        }
        return null as unknown as T;
      },
      all: async <T>() => {
        captured.push({ sql, bindings: pendingBindings });
        if (sql.includes('FROM social_drafts') && sql.includes("status = 'scheduled'")) {
          if (dueDelivered) return { results: [] as T[] };
          dueDelivered = true;
          return { results: (opts.dueDrafts ?? []) as unknown as T[] };
        }
        if (sql.includes('social_metrics_snapshots') || sql.includes('LEFT JOIN social_metrics_snapshots')) {
          return { results: (opts.bootstrapWindowMetrics ?? []) as unknown as T[] };
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
        // Each prepared statement was run via .bind() chain. The captured
        // array picked up nothing (batch() doesn't call .run()), so reach
        // into the statements via the same trick: re-invoke .run() to capture.
        for (const s of statements) {
          await s.run();
          group.push(captured.pop()!);
        }
        batched.push(group);
        // Re-append for outer-order assertions if useful.
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
    delete: vi.fn(async (key: string) => { delete store[key]; }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
  return { ns, store, putMock };
}

interface CreateEnvOpts extends DbStubOptions {
  killswitch?: string | null;
}

function createEnv(opts: CreateEnvOpts = {}) {
  const { db, captured, batched } = makeDb(opts);
  const killswitchInitial: Record<string, string | null> = {};
  if (opts.killswitch !== undefined && opts.killswitch !== null) {
    killswitchInitial.pinterest = opts.killswitch;
  }
  const killswitch = makeKv(killswitchInitial);
  const tokens = makeKv();

  const env = {
    DB: db,
    RR_SOCIAL_KILLSWITCH: killswitch.ns,
    RR_SOCIAL_TOKENS: tokens.ns,
    PINTEREST_CLIENT_ID: 'test-client-id',
    PINTEREST_CLIENT_SECRET: 'test-client-secret',
    PINTEREST_DEFAULT_BOARD_ID: 'BOARD_DEFAULT',
    NOTIFIER_FROM: 'social-bot@reduced.recipes',
    NOTIFIER_TO: 'ops@reduced.recipes',
    NOTIFIER_FROM_NAME: 'RR Social',
    NOTIFIER_CHANNEL: 'email' as const,
  };
  return { env, captured, batched, killswitch, tokens };
}

function makeDraft(id = 'DRAFT_01'): DraftRowFixture {
  return {
    id,
    source_id: 'SRC_01',
    caption: 'Garlic butter chicken in 20 minutes',
    hashtags: JSON.stringify(['#dinner', '#chicken']),
    cta_url: 'https://r.reduced.recipes/' + id + '?utm_source=pinterest',
    asset_r2_keys: JSON.stringify(['social/hero/abc.jpg', 'social/pin/abc.png']),
  };
}

function triggerRequest(): Request {
  return new Request('http://localhost/trigger', { method: 'POST' });
}

// Mock fetch globally; each test installs its own behaviour.
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  sendAlertMock.mockClear();
  getValidPinterestAccessTokenMock.mockClear();
  getValidPinterestAccessTokenMock.mockResolvedValue('fake-access-token');
  hoisted.ulidCounter.value = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('social-publisher-pinterest', () => {
  describe('killswitch path', () => {
    it('aborts before any Pinterest API call when RR_SOCIAL_KILLSWITCH:pinterest is set', async () => {
      const { env } = createEnv({ killswitch: 'manual hold' });

      const response = await publisher.fetch(triggerRequest(), env);
      const body = await response.json() as { published: number; failed: number; skipped: number };

      expect(response.status).toBe(200);
      expect(body).toEqual({ published: 0, failed: 0, skipped: 0 });

      // No Pinterest API calls, no token fetches, no D1 writes.
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getValidPinterestAccessTokenMock).not.toHaveBeenCalled();
      expect(sendAlertMock).not.toHaveBeenCalled();
    });
  });

  describe('daily cap', () => {
    it('publishes when below cap (warm-up: 0/2 published, 1 due)', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'PIN_REMOTE_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      const { env, captured, batched } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: Date.now() - 2 * 86_400_000, // day 2 -> warm-up cap=2
        dueDrafts: [makeDraft('DRAFT_A')],
      });

      const response = await publisher.fetch(triggerRequest(), env);
      const body = await response.json() as { published: number; failed: number };

      expect(response.status).toBe(200);
      expect(body.published).toBe(1);
      expect(body.failed).toBe(0);

      // Pinterest call shape.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
      expect(calledUrl).toBe('https://api.pinterest.com/v5/pins');
      expect((calledInit as RequestInit).method).toBe('POST');
      const headers = (calledInit as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer fake-access-token');
      const payload = JSON.parse((calledInit as RequestInit).body as string);
      expect(payload.board_id).toBe('BOARD_DEFAULT');
      expect(payload.link).toContain('utm_source=pinterest');
      expect(payload.media_source).toEqual({
        source_type: 'image_url',
        url: 'https://assets.reduced.recipes/social/pin/abc.png',
      });
      // description = caption + "\n\n" + hashtags joined by space
      expect(payload.description).toBe('Garlic butter chicken in 20 minutes\n\n#dinner #chicken');
      // No `title` field per spec.
      expect(payload.title).toBeUndefined();

      // Atomic write: one batch with social_posts INSERT + social_drafts UPDATE.
      expect(batched).toHaveLength(1);
      expect(batched[0]).toHaveLength(2);
      const insertRow = batched[0]![0]!;
      expect(insertRow.sql).toContain('INSERT INTO social_posts');
      // bind order: postId, draft.id, platform_post_id, permalink, short_link, published_at
      // ulid() is called once for runId at the top of run(), then again per
      // publishOne, so the post id ends with _02 (counter starts at 0).
      expect(String(insertRow.bindings[0])).toMatch(/^TEST_POST_\d{2}$/);
      expect(insertRow.bindings[1]).toBe('DRAFT_A');
      expect(insertRow.bindings[2]).toBe('PIN_REMOTE_1');
      expect(insertRow.bindings[3]).toBe('https://www.pinterest.com/pin/PIN_REMOTE_1/');
      expect(insertRow.bindings[4]).toContain('utm_source=pinterest');
      expect(insertRow.bindings[5]).toEqual(expect.any(Number));

      const updateRow = batched[0]![1]!;
      expect(updateRow.sql).toContain('UPDATE social_drafts');
      expect(updateRow.sql).toContain("status = 'published'");
      expect(updateRow.bindings).toEqual(['DRAFT_A']);

      // No alert on success.
      expect(sendAlertMock).not.toHaveBeenCalled();

      // Sanity: cap query bound the UTC midnight ms.
      const countQuery = captured.find((c) => c.sql.includes('COUNT(*)'));
      expect(countQuery).toBeDefined();
      const todayMs = Math.floor(Date.now() / 86_400_000) * 86_400_000;
      expect(countQuery!.bindings[0]).toBe(todayMs);
    });

    it('skips publishing when warm-up cap (2/day, days 0-13) is hit', async () => {
      const { env } = createEnv({
        todayPinterestCount: 2,
        firstPinAtMs: Date.now() - 5 * 86_400_000, // day 5
        dueDrafts: [makeDraft()],
      });

      const response = await publisher.fetch(triggerRequest(), env);
      const body = await response.json() as { published: number };

      expect(body.published).toBe(0);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(getValidPinterestAccessTokenMock).not.toHaveBeenCalled();
    });

    it('switches to steady cap (5/day) at day 14', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'PIN_REMOTE_X' }), { status: 200 }),
      );
      const { env, captured } = createEnv({
        todayPinterestCount: 3,           // would be over warm-up cap=2, but day>=14 -> cap=5
        firstPinAtMs: Date.now() - 14 * 86_400_000,
        dueDrafts: [makeDraft('DRAFT_AT_DAY_14')],
      });

      const response = await publisher.fetch(triggerRequest(), env);
      const body = await response.json() as { published: number };

      expect(body.published).toBe(1);

      // Confirm the LIMIT bound on the due query was 5 - 3 = 2 remaining.
      const dueQuery = captured.find(
        (c) => c.sql.includes('FROM social_drafts') && c.sql.includes("status = 'scheduled'"),
      );
      expect(dueQuery).toBeDefined();
      expect(dueQuery!.bindings[1]).toBe(2);
    });
  });

  describe('failure handling', () => {
    it('marks draft failed and alerts on 4xx without retrying', async () => {
      fetchMock.mockResolvedValueOnce(
        new Response('bad media url', { status: 400 }),
      );
      const { env, captured } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: null,
        dueDrafts: [makeDraft('DRAFT_BAD')],
      });

      const response = await publisher.fetch(triggerRequest(), env);
      const body = await response.json() as { published: number; failed: number };

      expect(body.published).toBe(0);
      expect(body.failed).toBe(1);

      // Exactly one Pinterest call -- 4xx should NOT retry.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // Draft marked failed with 4xx error message (truncated to 500 chars).
      const failUpdate = captured.find(
        (c) => c.sql.includes('UPDATE social_drafts')
          && c.sql.includes("status = 'failed'"),
      );
      expect(failUpdate).toBeDefined();
      expect(String(failUpdate!.bindings[0])).toContain('Pinterest 4xx: 400');
      expect(failUpdate!.bindings[1]).toBe('DRAFT_BAD');

      // Notifier alerted with error level.
      expect(sendAlertMock).toHaveBeenCalledTimes(1);
      const alert = sendAlertMock.mock.calls[0]![0];
      expect(alert.level).toBe('error');
      expect(alert.subject).toContain('DRAFT_BAD');
      expect(alert.body).toContain('Pinterest 4xx: 400');
    });

    it('retries 5xx with exponential backoff (30s, 2m, 10m), then succeeds', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      // 3 server errors then success on the 4th attempt.
      fetchMock
        .mockResolvedValueOnce(new Response('boom', { status: 503 }))
        .mockResolvedValueOnce(new Response('boom', { status: 503 }))
        .mockResolvedValueOnce(new Response('boom', { status: 503 }))
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ id: 'PIN_REMOTE_RETRY' }), { status: 200 }),
        );

      const { env, batched } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: null,
        dueDrafts: [makeDraft('DRAFT_RETRY')],
      });

      const promise = publisher.fetch(triggerRequest(), env);

      // Drain attempt 1 (immediate fetch, then sleep 30s).
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Sleep 2 minutes between attempt 2 and 3.
      await vi.advanceTimersByTimeAsync(120_000);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      // Sleep 10 minutes between attempt 3 and 4.
      await vi.advanceTimersByTimeAsync(600_000);
      expect(fetchMock).toHaveBeenCalledTimes(4);

      const response = await promise;
      const body = await response.json() as { published: number; failed: number };

      expect(body.published).toBe(1);
      expect(body.failed).toBe(0);

      // Successful retry => still gets a batched insert + update.
      expect(batched).toHaveLength(1);
      expect(batched[0]![0]!.sql).toContain('INSERT INTO social_posts');
      expect(sendAlertMock).not.toHaveBeenCalled();
    });

    it('treats 5xx-after-retries as failure (marks draft failed + alerts)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: false });

      fetchMock.mockResolvedValue(new Response('still down', { status: 503 }));

      const { env, captured } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: null,
        dueDrafts: [makeDraft('DRAFT_5XX_FATAL')],
      });

      const promise = publisher.fetch(triggerRequest(), env);

      // Drain all 3 retry sleeps (30s, 2m, 10m) plus the final attempt.
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);
      await vi.advanceTimersByTimeAsync(120_000);
      await vi.advanceTimersByTimeAsync(600_000);

      const response = await promise;
      const body = await response.json() as { published: number; failed: number };

      expect(body.published).toBe(0);
      expect(body.failed).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries

      const failUpdate = captured.find(
        (c) => c.sql.includes('UPDATE social_drafts')
          && c.sql.includes("status = 'failed'"),
      );
      expect(failUpdate).toBeDefined();
      expect(String(failUpdate!.bindings[0])).toContain('Pinterest 5xx after retries: 503');
      expect(sendAlertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('bootstrap engagement floor', () => {
    it('trips killswitch when last 3 pins each have <50 impressions (within 30-day window)', async () => {
      // No drafts due; we only want maybeTripBootstrapKillswitch to run.
      const { env, killswitch } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: Date.now() - 5 * 86_400_000, // day 5 -> within 30-day bootstrap window
        dueDrafts: [],
        bootstrapWindowMetrics: [
          { id: 'P1', impressions: 12 },
          { id: 'P2', impressions: 30 },
          { id: 'P3', impressions: 5 },
        ],
      });

      await publisher.fetch(triggerRequest(), env);

      expect(killswitch.putMock).toHaveBeenCalledTimes(1);
      const [key, value] = killswitch.putMock.mock.calls[0]!;
      expect(key).toBe('pinterest');
      expect(String(value)).toContain('bootstrap floor');

      expect(sendAlertMock).toHaveBeenCalledTimes(1);
      const alert = sendAlertMock.mock.calls[0]![0];
      expect(alert.level).toBe('warn');
      expect(alert.subject).toContain('killswitch');
    });

    it('does not trip killswitch if any of the last 3 pins is >=50 impressions', async () => {
      const { env, killswitch } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: Date.now() - 5 * 86_400_000,
        dueDrafts: [],
        bootstrapWindowMetrics: [
          { id: 'P1', impressions: 12 },
          { id: 'P2', impressions: 75 }, // healthy pin
          { id: 'P3', impressions: 5 },
        ],
      });

      await publisher.fetch(triggerRequest(), env);

      expect(killswitch.putMock).not.toHaveBeenCalled();
      expect(sendAlertMock).not.toHaveBeenCalled();
    });

    it('does not trip killswitch with fewer than 3 recent pins', async () => {
      const { env, killswitch } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: Date.now() - 5 * 86_400_000,
        dueDrafts: [],
        bootstrapWindowMetrics: [{ id: 'P1', impressions: 0 }],
      });

      await publisher.fetch(triggerRequest(), env);

      expect(killswitch.putMock).not.toHaveBeenCalled();
    });

    it('skips bootstrap check after day 30+', async () => {
      const { env, killswitch } = createEnv({
        todayPinterestCount: 0,
        firstPinAtMs: Date.now() - 31 * 86_400_000, // beyond 30-day window
        dueDrafts: [],
        bootstrapWindowMetrics: [
          { id: 'P1', impressions: 0 },
          { id: 'P2', impressions: 0 },
          { id: 'P3', impressions: 0 },
        ],
      });

      await publisher.fetch(triggerRequest(), env);

      expect(killswitch.putMock).not.toHaveBeenCalled();
    });
  });

  describe('routing', () => {
    it('returns 200 OK on GET /health', async () => {
      const { env } = createEnv({ killswitch: null });
      const response = await publisher.fetch(
        new Request('http://localhost/health'),
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    it('returns 404 for unknown paths', async () => {
      const { env } = createEnv({ killswitch: null });
      const response = await publisher.fetch(
        new Request('http://localhost/unknown'),
        env,
      );
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /trigger (only POST allowed)', async () => {
      const { env } = createEnv({ killswitch: null });
      const response = await publisher.fetch(
        new Request('http://localhost/trigger'),
        env,
      );
      expect(response.status).toBe(404);
    });
  });
});
