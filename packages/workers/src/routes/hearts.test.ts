import { describe, it, expect, vi, beforeEach } from 'vitest';
import hearts from './hearts';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';

const TEST_USER: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  picture_url: null,
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

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

function createMockKV(store = new Map<string, string>()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
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
    SESSION_KV: createMockKV(),
    VOTES_KV: createMockKV(),
    HOT_DECAY_SECONDS: '90000',
    HOT_EPOCH: '1704067200',
    HOT_RATE_LIMIT_PER_DAY: '100',
    WEIGHT_HEART: '1.0',
    ...overrides,
  } as unknown as Env;
}

function makeSessionKV(userId: string) {
  const session = JSON.stringify({ user_id: userId, created_at: Date.now() });
  const store = new Map<string, string>([['session:test-token', session]]);
  return createMockKV(store);
}

function makeUsersDB(heartRow: unknown = null, voteCountRow: unknown = null) {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(TEST_USER) };
      }
      if (sql.includes('SELECT 1 FROM recipe_votes') && sql.includes("action = 'heart'")) {
        return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(heartRow) };
      }
      if (sql.includes('INSERT OR IGNORE INTO recipe_votes')) {
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue(makeD1Result()) };
      }
      if (sql.includes('COUNT(*) as count') && sql.includes('MIN(created_at)')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: 1, first_voted: '2024-01-01T00:00:00Z' }),
        };
      }
      if (sql.includes('DELETE FROM recipe_votes')) {
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue(makeD1Result()) };
      }
      return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null), run: vi.fn().mockResolvedValue(makeD1Result()) };
    }),
    batch: vi.fn(),
  } as unknown as D1Database;
}

function makeRecipesDB(recipeRow: unknown = { id: 'recipe-1' }, voteCount = 1) {
  return {
    prepare: vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM recipes')) {
        return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(recipeRow) };
      }
      if (sql.includes('UPDATE recipes')) {
        return { bind: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue(makeD1Result()) };
      }
      if (sql.includes('SELECT vote_count FROM recipes')) {
        return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ vote_count: voteCount }) };
      }
      return { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue(null), run: vi.fn().mockResolvedValue(makeD1Result()) };
    }),
    batch: vi.fn(),
  } as unknown as D1Database;
}

function makeRequest(method: string, path: string, env: Env) {
  const req = new Request(`http://localhost${path}`, {
    method,
    headers: { Authorization: 'Bearer test-token' },
  });
  return hearts.request(req, {}, env);
}

describe('GET /api/v1/recipes/:id/heart', () => {
  it('returns hearted:true when vote exists', async () => {
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB({ exists: 1 }),
    });
    const res = await makeRequest('GET', '/api/v1/recipes/recipe-1/heart', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { hearted: boolean };
    expect(body.hearted).toBe(true);
  });

  it('returns hearted:false when no vote', async () => {
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB(null),
    });
    const res = await makeRequest('GET', '/api/v1/recipes/recipe-1/heart', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { hearted: boolean };
    expect(body.hearted).toBe(false);
  });

  it('returns 401 without auth', async () => {
    const env = createEnv({ SESSION_KV: createMockKV(), USERS_DB: makeUsersDB() });
    const res = await hearts.request(
      new Request('http://localhost/api/v1/recipes/recipe-1/heart'),
      {},
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/recipes/:id/heart', () => {
  it('returns 404 when recipe does not exist', async () => {
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB(null),
      DB: makeRecipesDB(null),
    });
    const res = await makeRequest('POST', '/api/v1/recipes/not-found/heart', env);
    expect(res.status).toBe(404);
  });

  it('returns hearted:true and vote_count on success', async () => {
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB(null),
      DB: makeRecipesDB({ id: 'recipe-1' }, 1),
    });
    const res = await makeRequest('POST', '/api/v1/recipes/recipe-1/heart', env);
    expect(res.status).toBe(201);
    const body = await res.json() as { hearted: boolean; vote_count: number };
    expect(body.hearted).toBe(true);
    expect(typeof body.vote_count).toBe('number');
  });

  it('returns 200 with existing heart (idempotent)', async () => {
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB({ exists: 1 }),
      DB: makeRecipesDB({ id: 'recipe-1' }, 5),
    });
    const res = await makeRequest('POST', '/api/v1/recipes/recipe-1/heart', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { hearted: boolean; vote_count: number };
    expect(body.hearted).toBe(true);
  });

  it('returns 429 when rate limit exceeded', async () => {
    const store = new Map<string, string>();
    const today = new Date().toISOString().slice(0, 10);
    store.set(`heart-rate:user-1:${today}`, '100'); // already at limit
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB(null),
      DB: makeRecipesDB({ id: 'recipe-1' }, 1),
      VOTES_KV: createMockKV(store),
      HOT_RATE_LIMIT_PER_DAY: '100',
    });
    const res = await makeRequest('POST', '/api/v1/recipes/recipe-1/heart', env);
    expect(res.status).toBe(429);
  });
});

describe('DELETE /api/v1/recipes/:id/heart', () => {
  it('returns hearted:false after un-hearting', async () => {
    const env = createEnv({
      SESSION_KV: makeSessionKV('user-1'),
      USERS_DB: makeUsersDB(null),
      DB: makeRecipesDB({ id: 'recipe-1' }, 0),
    });
    const res = await makeRequest('DELETE', '/api/v1/recipes/recipe-1/heart', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { hearted: boolean; vote_count: number };
    expect(body.hearted).toBe(false);
    expect(typeof body.vote_count).toBe('number');
  });
});
