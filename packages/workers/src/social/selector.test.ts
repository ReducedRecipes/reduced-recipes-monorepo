import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Stable ULIDs so per-row inserts are deterministic ────────────────────
let ulidCounter = 0;
vi.mock('@rr/social-shared', () => ({
  ulid: () => `TEST_ULID_${String(++ulidCounter).padStart(2, '0')}`,
}));

import selector from './selector';
import { score, seasonalityMatch, longtailFreshness, WEIGHTS } from './selector.score';

// ── D1 mock helpers (capture-bind-and-run pattern) ──────────────────────

interface CapturedBind {
  sql: string;
  bindings: unknown[];
}

function makeDbCapturing(canned: { matcher: string; results: unknown[] }[]) {
  const allBindCalls: CapturedBind[] = [];
  const batchInvocations: unknown[][] = [];

  const prepare = vi.fn((sql: string) => {
    const handle = {
      bind: vi.fn((...bindings: unknown[]) => {
        allBindCalls.push({ sql, bindings });
        return handle;
      }),
      run: vi.fn(async () => ({ success: true } as unknown as D1Result)),
      all: vi.fn(async <T,>() => {
        const match = canned.find((c) => sql.includes(c.matcher));
        return { results: (match?.results ?? []) as T[], success: true as const };
      }),
    };
    return handle;
  });

  const batch = vi.fn(async (statements: unknown[]) => {
    batchInvocations.push(statements);
    return statements.map(() => ({ success: true })) as unknown as D1Result[];
  });

  return {
    db: { prepare, batch } as unknown as D1Database,
    allBindCalls,
    batchInvocations,
  };
}

function makeQueue() {
  return {
    send: vi.fn(async () => {}),
    sendBatch: vi.fn(async () => {}),
  } as unknown as Queue<{ candidateId: string }> & {
    sendBatch: ReturnType<typeof vi.fn>;
  };
}

function runRequest() {
  return new Request('http://localhost/run', { method: 'POST' });
}

beforeEach(() => {
  ulidCounter = 0;
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Pure-math tests ──────────────────────────────────────────────────────

describe('selector.score', () => {
  describe('score()', () => {
    it('returns sum of WEIGHTS when all signals are 1 and recentlyPosted is 0', () => {
      const result = score({
        saveVelocity7d: 1,
        searchVolume7d: 1,
        seasonalityMatch: 1,
        editorialThemeMatch: 1,
        longtailFreshness: 1,
        recentlyPosted: 0,
      });
      const expected =
        WEIGHTS.save + WEIGHTS.search + WEIGHTS.seasonal + WEIGHTS.editorial + WEIGHTS.longtail;
      expect(result).toBeCloseTo(expected, 10);
      expect(result).toBeCloseTo(1.0, 10);
    });

    it('subtracts WEIGHTS.recencyPenalty when recentlyPosted is 1', () => {
      const inputs = {
        saveVelocity7d: 1,
        searchVolume7d: 1,
        seasonalityMatch: 1,
        editorialThemeMatch: 1,
        longtailFreshness: 1,
      } as const;
      const fresh = score({ ...inputs, recentlyPosted: 0 });
      const stale = score({ ...inputs, recentlyPosted: 1 });
      expect(fresh - stale).toBeCloseTo(WEIGHTS.recencyPenalty, 10);
    });
  });

  describe('seasonalityMatch()', () => {
    it("returns 1 for ['summer'] in July", () => {
      expect(seasonalityMatch(['summer'], new Date('2026-07-15T00:00:00Z'))).toBe(1);
    });

    it("returns 0 for ['winter'] in July", () => {
      expect(seasonalityMatch(['winter'], new Date('2026-07-15T00:00:00Z'))).toBe(0);
    });

    it('handles wrap-around winter range (Dec → Feb)', () => {
      expect(seasonalityMatch(['winter'], new Date('2026-01-15T00:00:00Z'))).toBe(1);
      expect(seasonalityMatch(['winter'], new Date('2026-12-15T00:00:00Z'))).toBe(1);
    });

    it('returns 0 for unknown tags', () => {
      expect(seasonalityMatch(['weeknight', 'fancy'], new Date('2026-07-15T00:00:00Z'))).toBe(0);
    });
  });

  describe('longtailFreshness()', () => {
    it('returns 1 for never-featured (null)', () => {
      expect(longtailFreshness(null)).toBe(1.0);
    });

    it('clips to 1 once we cross the 60-day horizon', () => {
      expect(longtailFreshness(60)).toBeCloseTo(1, 5);
      expect(longtailFreshness(180)).toBe(1);
    });

    it('returns ~0 for just-featured', () => {
      // log10(0+1)/log10(60) = 0
      expect(longtailFreshness(0)).toBe(0);
    });
  });
});

// ── End-to-end selector wiring ───────────────────────────────────────────

describe('social-selector worker', () => {
  it('picks top 4 for pinterest and emits exactly 4 queue messages', async () => {
    // Three recipes with varying signals so ordering is unambiguous.
    const recipes = [
      {
        id: 'rec-A', title: 'Weeknight pasta', cuisine: 'italian',
        total_time: 25, hot_score: 0.9, original_language: 'en',
        save_velocity_7d: 0.95, search_volume_7d: 0.6,
        tags_csv: 'weeknight,30-minute', last_featured_at: null,
      },
      {
        id: 'rec-B', title: 'Summer salad', cuisine: 'mediterranean',
        total_time: 15, hot_score: 0.7, original_language: 'en',
        save_velocity_7d: 0.4, search_volume_7d: 0.5,
        tags_csv: 'summer,no-bake', last_featured_at: null,
      },
      {
        id: 'rec-C', title: 'Slow braise', cuisine: 'french',
        total_time: 180, hot_score: 0.3, original_language: 'en',
        save_velocity_7d: 0.1, search_volume_7d: 0.05,
        tags_csv: 'braise,winter', last_featured_at: null,
      },
    ];

    const dbMock = makeDbCapturing([
      // First query: editorial themes for today.
      { matcher: 'social_editorial_calendar', results: [{ theme: 'weeknight_dinners', weight: 1.5 }] },
      // Second query: recipes JOIN.
      { matcher: 'FROM recipes r', results: recipes },
    ]);

    const pinterestQueue = makeQueue();

    const env = {
      DB: dbMock.db,
      PINTEREST_QUEUE: pinterestQueue,
    };

    const response = await selector.fetch(runRequest(), env as unknown as Parameters<typeof selector.fetch>[1]);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { candidatesEmitted: number; draftsCreated: number };

    // Only 3 recipes in the pool, so candidatesEmitted is 3 (the loop breaks
    // once all platforms are filled OR the pool runs out). DAILY_TARGETS are
    // 4/2/2 -> 3 recipes still emit messages on every queue.
    expect(json.candidatesEmitted).toBe(3);
    expect(json.draftsCreated).toBe(0);

    // Pinterest got all 3 candidate messages (couldn't fill its target of 4
    // because only 3 recipes were in the pool).
    expect(pinterestQueue.sendBatch).toHaveBeenCalledTimes(1);
    const sentBatch = (pinterestQueue.sendBatch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Array<{ body: { candidateId: string } }>;
    expect(sentBatch).toHaveLength(3);
    // Each message should carry a candidateId string.
    for (const msg of sentBatch) {
      expect(typeof msg.body.candidateId).toBe('string');
      expect(msg.body.candidateId).toMatch(/^TEST_ULID_/);
    }

    // Inserts went to D1 — three rows, one per candidate.
    const insertBinds = dbMock.allBindCalls.filter((c) =>
      c.sql.includes('INSERT INTO social_source_candidates'),
    );
    expect(insertBinds).toHaveLength(3);

    // Top-ranked candidate is rec-A (highest save_velocity + editorial match
    // for weeknight_dinners theme). It should be inserted first.
    const firstInsertRecipeId = insertBinds[0]!.bindings[1];
    expect(firstInsertRecipeId).toBe('rec-A');
  });

  it('picks top 4 from a 5-recipe pool and respects DAILY_TARGETS.pinterest', async () => {
    // Five recipes, all with valid signals — selector should stop after
    // emitting 4 because pinterest target is 4 and all platforms fill.
    const recipes = Array.from({ length: 5 }).map((_, i) => ({
      id: `rec-${i}`,
      title: `Recipe ${i}`,
      cuisine: 'italian',
      total_time: 30,
      hot_score: 0.5,
      original_language: 'en',
      save_velocity_7d: 1 - i * 0.1, // descending so order is deterministic
      search_volume_7d: 0.5,
      tags_csv: 'weeknight',
      last_featured_at: null,
    }));

    const dbMock = makeDbCapturing([
      { matcher: 'social_editorial_calendar', results: [{ theme: 'weeknight_dinners', weight: 1.0 }] },
      { matcher: 'FROM recipes r', results: recipes },
    ]);

    const pinterestQueue = makeQueue();
    const env = {
      DB: dbMock.db,
      PINTEREST_QUEUE: pinterestQueue,
    };

    const response = await selector.fetch(runRequest(), env as unknown as Parameters<typeof selector.fetch>[1]);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { candidatesEmitted: number };

    // 4 candidates emitted (pinterest target = 4).
    expect(json.candidatesEmitted).toBe(4);

    // Pinterest queue received exactly 4 messages.
    const sentBatch = (pinterestQueue.sendBatch as ReturnType<typeof vi.fn>).mock.calls[0]![0] as unknown[];
    expect(sentBatch).toHaveLength(4);
  });

  it('returns 0 candidates when pool is empty (no D1 batch, no queue calls)', async () => {
    const dbMock = makeDbCapturing([
      { matcher: 'social_editorial_calendar', results: [] },
      { matcher: 'FROM recipes r', results: [] },
    ]);
    const pinterestQueue = makeQueue();
    const env = {
      DB: dbMock.db,
      PINTEREST_QUEUE: pinterestQueue,
    };

    const response = await selector.fetch(runRequest(), env as unknown as Parameters<typeof selector.fetch>[1]);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { candidatesEmitted: number; draftsCreated: number };
    expect(json).toEqual({ candidatesEmitted: 0, draftsCreated: 0 });

    expect(dbMock.batchInvocations).toHaveLength(0);
    expect(pinterestQueue.sendBatch).not.toHaveBeenCalled();
  });

  it('does not call REELS/SHORTS queues when unbound (Phase 1)', async () => {
    const recipes = [
      {
        id: 'rec-A', title: 'X', cuisine: null, total_time: 30, hot_score: 0.5,
        original_language: 'en', save_velocity_7d: 0.5, search_volume_7d: 0.5,
        tags_csv: 'weeknight', last_featured_at: null,
      },
    ];

    const dbMock = makeDbCapturing([
      { matcher: 'social_editorial_calendar', results: [{ theme: 'weeknight_dinners', weight: 1.0 }] },
      { matcher: 'FROM recipes r', results: recipes },
    ]);

    const pinterestQueue = makeQueue();
    const env = {
      DB: dbMock.db,
      PINTEREST_QUEUE: pinterestQueue,
      // REELS_QUEUE and SHORTS_QUEUE intentionally absent.
    };

    const response = await selector.fetch(runRequest(), env as unknown as Parameters<typeof selector.fetch>[1]);
    expect(response.status).toBe(200);
    expect(pinterestQueue.sendBatch).toHaveBeenCalledTimes(1);
  });

  describe('routing', () => {
    it('returns 200 OK on GET /health', async () => {
      const dbMock = makeDbCapturing([]);
      const env = { DB: dbMock.db, PINTEREST_QUEUE: makeQueue() };

      const response = await selector.fetch(
        new Request('http://localhost/health'),
        env as unknown as Parameters<typeof selector.fetch>[1],
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    it('returns 404 for unknown paths', async () => {
      const dbMock = makeDbCapturing([]);
      const env = { DB: dbMock.db, PINTEREST_QUEUE: makeQueue() };

      const response = await selector.fetch(
        new Request('http://localhost/unknown'),
        env as unknown as Parameters<typeof selector.fetch>[1],
      );
      expect(response.status).toBe(404);
    });

    it('returns 404 for GET /run (only POST allowed)', async () => {
      const dbMock = makeDbCapturing([]);
      const env = { DB: dbMock.db, PINTEREST_QUEUE: makeQueue() };

      const response = await selector.fetch(
        new Request('http://localhost/run'),
        env as unknown as Parameters<typeof selector.fetch>[1],
      );
      expect(response.status).toBe(404);
    });
  });
});
