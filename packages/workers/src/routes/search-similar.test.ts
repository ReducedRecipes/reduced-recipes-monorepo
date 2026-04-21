import { describe, it, expect, vi } from 'vitest';
import searchSimilar from './search-similar';
import type { Env } from '@rr/shared/env';

function makeD1Result(results: Record<string, unknown>[] = []): D1Result {
  return { results, success: true, meta: {} as D1Meta & Record<string, unknown> } as D1Result;
}

function makeStmt(firstValue: unknown = null, allResults: Record<string, unknown>[] = []) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(firstValue),
    run: vi.fn().mockResolvedValue(makeD1Result()),
    all: vi.fn().mockResolvedValue(makeD1Result(allResults)),
    raw: vi.fn().mockResolvedValue([]),
  };
}

function makeVectorize(vectors: VectorizeVector[] = [], queryMatches: VectorizeMatch[] = []) {
  return {
    getByIds: vi.fn().mockResolvedValue(vectors),
    query: vi.fn().mockResolvedValue({ matches: queryMatches }),
    insert: vi.fn().mockResolvedValue({}),
    upsert: vi.fn().mockResolvedValue({}),
    deleteByIds: vi.fn().mockResolvedValue({}),
    describe: vi.fn().mockResolvedValue({}),
  } as unknown as VectorizeIndex;
}

function makeRecipeRow(id: string) {
  return {
    id,
    title: `Recipe ${id}`,
    domain: 'example.com',
    image_url: null,
    total_time: 30,
    cook_time: 20,
    yields: '4 servings',
    cuisine: 'Italian',
    category: 'Pasta',
  };
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue(makeStmt({ id: 'recipe-1' })),
      batch: vi.fn(),
    },
    RECIPES_KV: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn(), getWithMetadata: vi.fn() },
    CACHE_KV: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn(), getWithMetadata: vi.fn() },
    IMAGES_R2: {},
    CRAWL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PARSE_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PROJECTION_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    ADMIN_TOKEN: 'test-token',
    BOT_USER_AGENT: 'TestBot',
    DEFAULT_CRAWL_DELAY_MS: '2000',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    ...overrides,
  } as unknown as Env;
}

describe('GET /api/v1/search/similar/:id', () => {
  it('returns 503 when VECTORIZE binding is absent', async () => {
    const env = createEnv();
    const res = await searchSimilar.request('/api/v1/search/similar/recipe-1', {}, env);
    expect(res.status).toBe(503);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('returns 404 when recipe does not exist', async () => {
    const env = createEnv({
      VECTORIZE: makeVectorize(),
      DB: {
        prepare: vi.fn().mockReturnValue(makeStmt(null)),
        batch: vi.fn(),
      },
    });
    const res = await searchSimilar.request('/api/v1/search/similar/nonexistent', {}, env);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns empty items when recipe has no vector', async () => {
    const env = createEnv({
      VECTORIZE: makeVectorize([], []),
    });
    const res = await searchSimilar.request('/api/v1/search/similar/recipe-1', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });

  it('returns similar recipes excluding the source recipe', async () => {
    const sourceVector: VectorizeVector = {
      id: 'recipe-1',
      values: [0.1, 0.2, 0.3],
    };
    const queryMatches: VectorizeMatch[] = [
      { id: 'recipe-1', score: 1.0 },  // source — should be excluded
      { id: 'recipe-2', score: 0.95 },
      { id: 'recipe-3', score: 0.90 },
    ];

    const recipeRows = [makeRecipeRow('recipe-2'), makeRecipeRow('recipe-3')];

    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM recipes WHERE id = ?')) {
          return makeStmt({ id: 'recipe-1' });
        }
        if (sql.includes('FROM recipes WHERE id IN')) {
          return makeStmt(null, recipeRows);
        }
        if (sql.includes('FROM recipe_tags WHERE recipe_id IN')) {
          return makeStmt(null, []);
        }
        return makeStmt();
      }),
      batch: vi.fn(),
    };

    const env = createEnv({
      VECTORIZE: makeVectorize([sourceVector], queryMatches),
      DB: db,
    });

    const res = await searchSimilar.request('/api/v1/search/similar/recipe-1', {}, env);
    expect(res.status).toBe(200);

    const body = await res.json() as { items: { id: string }[] };
    const ids = body.items.map((i) => i.id);
    expect(ids).not.toContain('recipe-1');
    expect(ids).toContain('recipe-2');
    expect(ids).toContain('recipe-3');
  });

  it('respects the limit query parameter', async () => {
    const sourceVector: VectorizeVector = { id: 'recipe-1', values: [0.1, 0.2] };
    const queryMatches: VectorizeMatch[] = [
      { id: 'recipe-2', score: 0.95 },
      { id: 'recipe-3', score: 0.90 },
      { id: 'recipe-4', score: 0.85 },
    ];

    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM recipes WHERE id = ?')) {
          return makeStmt({ id: 'recipe-1' });
        }
        if (sql.includes('FROM recipes WHERE id IN')) {
          return makeStmt(null, [makeRecipeRow('recipe-2')]);
        }
        if (sql.includes('FROM recipe_tags WHERE recipe_id IN')) {
          return makeStmt(null, []);
        }
        return makeStmt();
      }),
      batch: vi.fn(),
    };

    const env = createEnv({
      VECTORIZE: makeVectorize([sourceVector], queryMatches),
      DB: db,
    });

    const res = await searchSimilar.request('/api/v1/search/similar/recipe-1?limit=1', {}, env);
    expect(res.status).toBe(200);

    const vectorize = env.VECTORIZE as ReturnType<typeof makeVectorize>;
    const queryCall = vectorize.query.mock.calls[0];
    // topK should be limit + 1 = 2
    expect(queryCall[1].topK).toBe(2);
  });

  it('sets cache headers on success', async () => {
    const sourceVector: VectorizeVector = { id: 'recipe-1', values: [0.1, 0.2] };
    const queryMatches: VectorizeMatch[] = [{ id: 'recipe-2', score: 0.9 }];

    const db = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT id FROM recipes WHERE id = ?')) {
          return makeStmt({ id: 'recipe-1' });
        }
        if (sql.includes('FROM recipes WHERE id IN')) {
          return makeStmt(null, [makeRecipeRow('recipe-2')]);
        }
        if (sql.includes('FROM recipe_tags WHERE recipe_id IN')) {
          return makeStmt(null, []);
        }
        return makeStmt();
      }),
      batch: vi.fn(),
    };

    const env = createEnv({
      VECTORIZE: makeVectorize([sourceVector], queryMatches),
      DB: db,
    });

    const res = await searchSimilar.request('/api/v1/search/similar/recipe-1', {}, env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
  });

  it('returns empty items when no matches found', async () => {
    const sourceVector: VectorizeVector = { id: 'recipe-1', values: [0.1, 0.2] };
    const env = createEnv({
      VECTORIZE: makeVectorize([sourceVector], []),
    });
    const res = await searchSimilar.request('/api/v1/search/similar/recipe-1', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toEqual([]);
  });
});
