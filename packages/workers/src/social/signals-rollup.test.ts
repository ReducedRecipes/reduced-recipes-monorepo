import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import signalsRollup from './signals-rollup';

// ── D1 mock helpers ─────────────────────────────────────────────────────

/**
 * Build a mock D1Database whose .prepare() returns canned rows for SELECT
 * statements (matched against substrings of the SQL) and records every
 * .bind(...) call in `allBindCalls`. The worker uses a single prepared
 * statement and rebinds it per-row before pushing into env.DB.batch([...]),
 * so capturing at .bind() time is the correct hook to inspect per-row
 * bindings.
 */
function makeDbCapturing(canned: { matcher: string; results: unknown[] }[]) {
  const allBindCalls: { sql: string; bindings: unknown[] }[] = [];
  const batchInvocations: number[] = []; // sizes of each batch call

  const prepare = vi.fn((sql: string) => {
    const handle = {
      bind: vi.fn((...bindings: unknown[]) => {
        allBindCalls.push({ sql, bindings });
        // Each .bind() must return a *new* handle so batch() receives one
        // statement-per-row (otherwise the same handle is referenced N times
        // in the array, but that's still fine for our assertions which look
        // at `allBindCalls`).
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
    batchInvocations.push(statements.length);
    return statements.map(() => ({ success: true })) as unknown as D1Result[];
  });

  return {
    db: { prepare, batch } as unknown as D1Database,
    allBindCalls,
    batchInvocations,
  };
}

function triggerRequest() {
  return new Request('http://localhost/trigger', { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('social-signals-rollup', () => {
  describe('happy path: saves and searches normalised by p95', () => {
    it('upserts one row per recipe with clipped [0,1] velocities', async () => {
      // 5 recipes with save counts 1, 2, 5, 10, 100 -> sorted, p95 index = floor(5*0.95) = 4 -> 100
      const usersDbMock = makeDbCapturing([
        {
          matcher: 'recipe_votes',
          results: [
            { recipe_id: 'r1', saves: 1 },
            { recipe_id: 'r2', saves: 2 },
            { recipe_id: 'r3', saves: 5 },
            { recipe_id: 'r4', saves: 10 },
            { recipe_id: 'r5', saves: 100 },
          ],
        },
      ]);
      // Same shape for searches but different values.
      const recipesDbMock = makeDbCapturing([
        {
          matcher: 'social_search_hits',
          results: [
            { recipe_id: 'r1', hits: 4 },
            { recipe_id: 'r2', hits: 8 },
            { recipe_id: 'r3', hits: 20 },
            { recipe_id: 'r4', hits: 40 },
            { recipe_id: 'r5', hits: 200 },
          ],
        },
      ]);

      const env = {
        DB: recipesDbMock.db,
        USERS_DB: usersDbMock.db,
      };

      const response = await signalsRollup.fetch(triggerRequest(), env);
      expect(response.status).toBe(200);
      const json = (await response.json()) as { recipes: number };
      expect(json.recipes).toBe(5);

      // The INSERT/upsert is prepared and bound on the recipes DB.
      const upsertBinds = recipesDbMock.allBindCalls.filter((c) =>
        c.sql.includes('INSERT INTO social_recipe_signals'),
      );
      expect(upsertBinds).toHaveLength(5);

      // p95 for saves is 100 -> r1=1/100=0.01, r5=100/100=1.0
      const byRecipe = new Map(
        upsertBinds.map((b) => [b.bindings[0] as string, b.bindings]),
      );

      const r1 = byRecipe.get('r1')!;
      expect(r1[1]).toBeCloseTo(0.01, 5); // save_velocity_7d
      expect(r1[3]).toBe(1); // raw_saves_7d

      const r5 = byRecipe.get('r5')!;
      expect(r5[1]).toBe(1.0); // save_velocity_7d clipped to 1
      expect(r5[3]).toBe(100); // raw_saves_7d
      expect(r5[4]).toBe(200); // raw_searches_7d

      // search p95 is 200 (last sorted value) -> r5=200/200=1.0
      expect(r5[2]).toBe(1.0); // search_volume_7d

      // Exactly one batch call.
      expect(recipesDbMock.batchInvocations).toEqual([5]);
    });
  });

  describe('empty result sets', () => {
    it('does not call batch and returns { recipes: 0 } when both DBs return empty', async () => {
      const usersDbMock = makeDbCapturing([{ matcher: 'recipe_votes', results: [] }]);
      const recipesDbMock = makeDbCapturing([{ matcher: 'social_search_hits', results: [] }]);

      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };

      const response = await signalsRollup.fetch(triggerRequest(), env);
      expect(response.status).toBe(200);
      const json = (await response.json()) as { recipes: number };
      expect(json.recipes).toBe(0);

      // No upsert binds, no batch call (no division by zero).
      const upsertBinds = recipesDbMock.allBindCalls.filter((c) =>
        c.sql.includes('INSERT INTO social_recipe_signals'),
      );
      expect(upsertBinds).toHaveLength(0);
      expect(recipesDbMock.batchInvocations).toEqual([]);
    });
  });

  describe('search-volume only (no saves)', () => {
    it('writes rows with save_velocity_7d=0 and search_volume_7d>0', async () => {
      const usersDbMock = makeDbCapturing([{ matcher: 'recipe_votes', results: [] }]);
      const recipesDbMock = makeDbCapturing([
        {
          matcher: 'social_search_hits',
          results: [
            { recipe_id: 'r1', hits: 3 },
            { recipe_id: 'r2', hits: 7 },
          ],
        },
      ]);

      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };

      const response = await signalsRollup.fetch(triggerRequest(), env);
      expect(response.status).toBe(200);
      const json = (await response.json()) as { recipes: number };
      expect(json.recipes).toBe(2);

      const upsertBinds = recipesDbMock.allBindCalls.filter((c) =>
        c.sql.includes('INSERT INTO social_recipe_signals'),
      );
      expect(upsertBinds).toHaveLength(2);

      for (const bind of upsertBinds) {
        // bindings[1] = save_velocity_7d, bindings[3] = raw_saves_7d
        expect(bind.bindings[1]).toBe(0);
        expect(bind.bindings[3]).toBe(0);
        // bindings[2] = search_volume_7d (must be > 0)
        expect(bind.bindings[2] as number).toBeGreaterThan(0);
        // bindings[4] = raw_searches_7d (must be > 0)
        expect(bind.bindings[4] as number).toBeGreaterThan(0);
      }
    });
  });

  describe('SQL shape', () => {
    it('uses datetime SQL filter (no unix-ms binding) for recipe_votes', async () => {
      const usersDbMock = makeDbCapturing([{ matcher: 'recipe_votes', results: [] }]);
      const recipesDbMock = makeDbCapturing([{ matcher: 'social_search_hits', results: [] }]);

      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };
      await signalsRollup.fetch(triggerRequest(), env);

      const usersDb = usersDbMock.db as unknown as { prepare: ReturnType<typeof vi.fn> };
      const sqlsCalledOnUsersDb = usersDb.prepare.mock.calls.map((args) => args[0] as string);

      // The users DB query must use the SQL datetime function, not a bound parameter.
      expect(sqlsCalledOnUsersDb.some((s) => s.includes("action = 'heart'"))).toBe(true);
      expect(sqlsCalledOnUsersDb.some((s) => s.includes("datetime('now', '-7 days')"))).toBe(true);
    });

    it('queries the recipes DB with a date string parameter for social_search_hits', async () => {
      const usersDbMock = makeDbCapturing([{ matcher: 'recipe_votes', results: [] }]);
      const recipesDbMock = makeDbCapturing([{ matcher: 'social_search_hits', results: [] }]);

      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };
      await signalsRollup.fetch(triggerRequest(), env);

      const searchSelectBinds = recipesDbMock.allBindCalls.filter((c) =>
        c.sql.includes('FROM social_search_hits'),
      );
      expect(searchSelectBinds).toHaveLength(1);
      // Date string in YYYY-MM-DD format.
      expect(searchSelectBinds[0]!.bindings[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('routing', () => {
    it('returns 200 OK on GET /health', async () => {
      const usersDbMock = makeDbCapturing([]);
      const recipesDbMock = makeDbCapturing([]);
      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };

      const response = await signalsRollup.fetch(
        new Request('http://localhost/health'),
        env,
      );
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('OK');
    });

    it('returns 404 for unknown paths', async () => {
      const usersDbMock = makeDbCapturing([]);
      const recipesDbMock = makeDbCapturing([]);
      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };

      const response = await signalsRollup.fetch(
        new Request('http://localhost/unknown'),
        env,
      );
      expect(response.status).toBe(404);
    });

    it('responds to POST /run as well as POST /trigger', async () => {
      const usersDbMock = makeDbCapturing([{ matcher: 'recipe_votes', results: [] }]);
      const recipesDbMock = makeDbCapturing([{ matcher: 'social_search_hits', results: [] }]);
      const env = { DB: recipesDbMock.db, USERS_DB: usersDbMock.db };

      const response = await signalsRollup.fetch(
        new Request('http://localhost/run', { method: 'POST' }),
        env,
      );
      expect(response.status).toBe(200);
      const json = (await response.json()) as { recipes: number };
      expect(json.recipes).toBe(0);
    });
  });
});

