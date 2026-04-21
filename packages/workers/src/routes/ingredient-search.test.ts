import { describe, it, expect, vi, beforeEach } from 'vitest';
import ingredientSearch from './ingredient-search';
import type { Env } from '@rr/shared/env';

function makeD1Result(results: Record<string, unknown>[] = []): D1Result {
  return { results, success: true, meta: {} as D1Meta & Record<string, unknown> } as D1Result;
}

// Recipes and ingredients used across tests
const RECIPE_ROWS = [
  { id: 'r1', title: 'Beef Stew', domain: 'example.com', image_url: null, total_time: 60, cook_time: 45, yields: '4 servings', cuisine: 'American', category: 'Dinner' },
  { id: 'r2', title: 'Chicken Soup', domain: 'example.com', image_url: null, total_time: 30, cook_time: 20, yields: '2 servings', cuisine: null, category: null },
];

const INGREDIENT_ROWS = [
  { recipe_id: 'r1', ingredient: 'beef' },
  { recipe_id: 'r1', ingredient: 'potato' },
  { recipe_id: 'r1', ingredient: 'carrot' },
  { recipe_id: 'r2', ingredient: 'chicken breast' },
  { recipe_id: 'r2', ingredient: 'carrot' },
];

function createDB(matchRows: { recipe_id: string; match_count: number }[] = [{ recipe_id: 'r1', match_count: 1 }]) {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue(
        sql.includes('match_count')
          ? makeD1Result(matchRows)
          : sql.includes('FROM recipes')
          ? makeD1Result(RECIPE_ROWS)
          : makeD1Result(INGREDIENT_ROWS),
      ),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue(makeD1Result()),
      raw: vi.fn().mockResolvedValue([]),
    })),
    batch: vi.fn(),
  };
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    DB: createDB(),
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

function mockRequest(url: string, env: Env) {
  return ingredientSearch.request(url, { method: 'GET' }, env);
}

describe('GET /api/v1/search/by-ingredients', () => {
  it('returns 400 when have param is missing', async () => {
    const env = createEnv();
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients', env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for invalid mode param', async () => {
    const env = createEnv();
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&mode=fuzzy', env);
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('returns results in exact mode (default)', async () => {
    const env = createEnv();
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; has_more: boolean };
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.has_more).toBe('boolean');
  });

  it('returns results with explicit mode=exact', async () => {
    const env = createEnv();
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&mode=exact', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns results in semantic mode when AI binding is present', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({
        response: '{"beef": ["beef", "ground beef", "steak", "minced beef"]}',
      }),
    };
    const env = createEnv({ AI: mockAI });
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&mode=semantic', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
    // AI should have been called to expand terms
    expect(mockAI.run).toHaveBeenCalledOnce();
  });

  it('falls back to exact behavior in semantic mode when AI binding is absent', async () => {
    const env = createEnv({ AI: undefined });
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&mode=semantic', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('falls back gracefully when AI throws in semantic mode', async () => {
    const mockAI = {
      run: vi.fn().mockRejectedValue(new Error('AI unavailable')),
    };
    const env = createEnv({ AI: mockAI });
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&mode=semantic', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('returns empty items when no recipes match', async () => {
    const env = createEnv({
      DB: {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result([])),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue(makeD1Result()),
          raw: vi.fn().mockResolvedValue([]),
        })),
        batch: vi.fn(),
      },
    });
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=truffle', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; has_more: boolean };
    expect(body.items).toHaveLength(0);
    expect(body.has_more).toBe(false);
  });

  it('does not use AI in exact mode even if AI binding is present', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ response: '{"beef": ["beef"]}' }),
    };
    const env = createEnv({ AI: mockAI });
    const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&mode=exact', env);
    expect(res.status).toBe(200);
    expect(mockAI.run).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/ingredients/suggest', () => {
  it('returns empty items when query is too short', async () => {
    const env = createEnv();
    const res = await mockRequest('http://localhost/api/v1/ingredients/suggest', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });

  it('returns suggestions for a valid query', async () => {
    const env = createEnv({
      DB: {
        prepare: vi.fn().mockImplementation(() => ({
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result([{ name: 'beef', count: 100 }])),
          first: vi.fn().mockResolvedValue(null),
          run: vi.fn().mockResolvedValue(makeD1Result()),
          raw: vi.fn().mockResolvedValue([]),
        })),
        batch: vi.fn(),
      },
    });
    const res = await mockRequest('http://localhost/api/v1/ingredients/suggest?q=be', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: { name: string; count: number }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('beef');
  });
});
