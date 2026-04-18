import { describe, it, expect, vi, beforeEach } from 'vitest';
import bookmarks from './bookmarks';
import type { Env } from '@rr/shared/env';
import type { User } from '@rr/shared';

// ── Mock helpers ────────────────────────────────────────────────────────

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

function createMockKV(store = new Map<string, string>()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
    delete: vi.fn(async (key: string) => { store.delete(key); }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function createMockUsersDB(overrides: {
  collectionId?: string;
  bookmarks?: Record<string, unknown>[];
  collections?: Record<string, unknown>[];
  insertError?: string;
  updateError?: string;
} = {}) {
  const collectionId = overrides.collectionId ?? 'col-1';
  const bookmarksList = overrides.bookmarks ?? [];
  const collectionsList = overrides.collections ?? [];

  return {
    prepare: vi.fn((sql: string) => {
      // SELECT user for auth middleware
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      // SELECT collection by id and user_id (for collection_id validation and move target)
      if (sql.includes('SELECT id FROM collections WHERE id = ?') && sql.includes('user_id')) {
        return {
          bind: vi.fn((...args: string[]) => ({
            first: vi.fn().mockResolvedValue(
              collectionsList.find((col) => col.id === args[0] && col.user_id === args[1]) ?? null,
            ),
          })),
        };
      }
      // SELECT default collection
      if (sql.includes('collections') && sql.includes('is_default')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(collectionId ? { id: collectionId } : null),
        };
      }
      // INSERT bookmark
      if (sql.includes('INSERT INTO bookmarks')) {
        if (overrides.insertError) {
          return {
            bind: vi.fn().mockReturnThis(),
            run: vi.fn().mockRejectedValue(new Error(overrides.insertError)),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // SELECT bookmark by id for move/delete (with collection_id, recipe_id)
      if (sql.includes('SELECT id, collection_id, recipe_id FROM bookmarks')) {
        return {
          bind: vi.fn((...args: string[]) => ({
            first: vi.fn().mockResolvedValue(
              bookmarksList.find((b) => b.id === args[0] && b.user_id === args[1]) ?? null,
            ),
          })),
        };
      }
      // SELECT bookmark by id (for DELETE check)
      if (sql.includes('SELECT id FROM bookmarks WHERE id')) {
        return {
          bind: vi.fn((...args: string[]) => ({
            first: vi.fn().mockResolvedValue(
              bookmarksList.find((b) => b.id === args[0] && b.user_id === args[1]) ?? null,
            ),
          })),
        };
      }
      // UPDATE bookmark (move)
      if (sql.includes('UPDATE bookmarks SET collection_id')) {
        if (overrides.updateError) {
          return {
            bind: vi.fn().mockReturnThis(),
            run: vi.fn().mockRejectedValue(new Error(overrides.updateError)),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // DELETE bookmark
      if (sql.includes('DELETE FROM bookmarks')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // SELECT bookmarks for search (no ORDER BY)
      if (sql.includes('FROM bookmarks WHERE user_id') && !sql.includes('ORDER BY')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(bookmarksList as Record<string, unknown>[])),
        };
      }
      // SELECT bookmarks list (with ORDER BY)
      if (sql.includes('FROM bookmarks') && sql.includes('ORDER BY')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(bookmarksList as Record<string, unknown>[])),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue(makeD1Result()),
        run: vi.fn().mockResolvedValue(makeD1Result()),
      };
    }),
  } as unknown as D1Database;
}

function createMockRecipesDB(opts: {
  hasRecipe?: boolean;
  searchResults?: Record<string, unknown>[];
} = {}) {
  const hasRecipe = opts.hasRecipe ?? true;
  const searchResults = opts.searchResults ?? [];

  return {
    prepare: vi.fn((sql: string) => {
      // Search query (IN + LIKE)
      if (sql.includes('IN') && sql.includes('LIKE')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(searchResults)),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(hasRecipe ? { id: 'recipe-1' } : null),
        all: vi.fn().mockResolvedValue(makeD1Result()),
      };
    }),
    batch: vi.fn().mockResolvedValue([]),
  } as unknown as D1Database;
}

function makeEnv(opts: {
  usersDB?: D1Database;
  recipesDB?: D1Database;
  sessionKV?: KVNamespace;
} = {}): Env {
  const kvStore = new Map<string, string>();
  kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

  return {
    DB: opts.recipesDB ?? createMockRecipesDB(),
    RECIPES_KV: {} as KVNamespace,
    CACHE_KV: {} as KVNamespace,
    IMAGES_R2: {} as R2Bucket,
    CRAWL_QUEUE: {} as Queue,
    PARSE_QUEUE: {} as Queue,
    PROJECTION_QUEUE: {} as Queue,
    ADMIN_TOKEN: 'admin',
    BOT_USER_AGENT: 'bot',
    DEFAULT_CRAWL_DELAY_MS: '500',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    SESSION_KV: opts.sessionKV ?? createMockKV(kvStore),
    USERS_DB: opts.usersDB ?? createMockUsersDB(),
  };
}

function authedEnv(usersDBOverrides: Parameters<typeof createMockUsersDB>[0] = {}, recipesDBOpts: Parameters<typeof createMockRecipesDB>[0] = {}) {
  const kvStore = new Map<string, string>();
  kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));
  const usersDB = createMockUsersDB(usersDBOverrides);
  return makeEnv({
    sessionKV: createMockKV(kvStore),
    usersDB,
    recipesDB: createMockRecipesDB(recipesDBOpts),
  });
}

function req(path: string, env: Env, init?: RequestInit) {
  return bookmarks.request(path, init ?? {}, env);
}

const AUTH_HEADERS = { Authorization: 'Bearer valid-token' };

// ── Tests ────────────────────────────────────────────────────────────────

describe('POST /api/v1/bookmarks', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('creates a bookmark using default collection when no collection_id', async () => {
    const env = authedEnv({ collectionId: 'col-1' });
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; recipe_id: string; collection_id: string };
    expect(body.recipe_id).toBe('recipe-1');
    expect(body.collection_id).toBe('col-1');
    expect(body.id).toBeDefined();
  });

  it('creates a bookmark in specified collection_id', async () => {
    const env = authedEnv({
      collectionId: 'col-default',
      collections: [{ id: 'col-custom', user_id: 'user-1' }],
    });
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1', collection_id: 'col-custom' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { collection_id: string };
    expect(body.collection_id).toBe('col-custom');
  });

  it('returns 404 when specified collection_id does not exist', async () => {
    const env = authedEnv({ collections: [] });
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1', collection_id: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 when recipe does not exist', async () => {
    const env = authedEnv({}, { hasRecipe: false });
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate bookmark', async () => {
    const env = authedEnv({ insertError: 'UNIQUE constraint failed' });
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_BOOKMARKED');
  });

  it('returns 400 when recipe_id is missing', async () => {
    const env = authedEnv();
    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/bookmarks/move', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ bookmark_id: 'bk-1', target_collection_id: 'col-2' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('moves a bookmark to target collection', async () => {
    const env = authedEnv({
      bookmarks: [{ id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1' }],
      collections: [{ id: 'col-2', user_id: 'user-1' }],
    });
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ bookmark_id: 'bk-1', target_collection_id: 'col-2' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });

  it('returns 404 when bookmark does not exist', async () => {
    const env = authedEnv({
      bookmarks: [],
      collections: [{ id: 'col-2', user_id: 'user-1' }],
    });
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ bookmark_id: 'nonexistent', target_collection_id: 'col-2' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 when target collection does not exist', async () => {
    const env = authedEnv({
      bookmarks: [{ id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1' }],
      collections: [],
    });
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ bookmark_id: 'bk-1', target_collection_id: 'nonexistent' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(404);
  });

  it('returns 400 when bookmark_id is missing', async () => {
    const env = authedEnv();
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ target_collection_id: 'col-2' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(400);
  });

  it('returns 400 when target_collection_id is missing', async () => {
    const env = authedEnv();
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ bookmark_id: 'bk-1' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 when recipe already exists in target collection', async () => {
    const env = authedEnv({
      bookmarks: [{ id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1' }],
      collections: [{ id: 'col-2', user_id: 'user-1' }],
      updateError: 'UNIQUE constraint failed',
    });
    const res = await req('/api/v1/bookmarks/move', env, {
      method: 'POST',
      body: JSON.stringify({ bookmark_id: 'bk-1', target_collection_id: 'col-2' }),
      headers: { 'Content-Type': 'application/json', ...AUTH_HEADERS },
    });

    expect(res.status).toBe(409);
  });
});

describe('GET /api/v1/bookmarks/search', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/bookmarks/search?q=chicken', env);
    expect(res.status).toBe(401);
  });

  it('returns 400 when query is empty', async () => {
    const env = authedEnv();
    const res = await req('/api/v1/bookmarks/search?q=', env, {
      headers: AUTH_HEADERS,
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 when query param is missing', async () => {
    const env = authedEnv();
    const res = await req('/api/v1/bookmarks/search', env, {
      headers: AUTH_HEADERS,
    });

    expect(res.status).toBe(400);
  });

  it('returns matching bookmarked recipes', async () => {
    const bks = [
      { id: 'bk-1', user_id: 'user-1', recipe_id: 'r1', collection_id: 'col-1', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      { id: 'bk-2', user_id: 'user-1', recipe_id: 'r2', collection_id: 'col-1', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
    ];
    const recipes = [
      { id: 'r1', title: 'Chicken Curry', domain: 'example.com', image_url: null, total_time: 30, cook_time: 20, yields: '4', cuisine: 'Indian' },
    ];

    const env = authedEnv({ bookmarks: bks }, { searchResults: recipes });
    const res = await req('/api/v1/bookmarks/search?q=chicken', env, {
      headers: AUTH_HEADERS,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: { id: string; recipe_id: string; title: string }[] };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.recipe_id).toBe('r1');
    expect(body.items[0]!.title).toBe('Chicken Curry');
  });

  it('returns empty array when no bookmarks match', async () => {
    const env = authedEnv({ bookmarks: [] });
    const res = await req('/api/v1/bookmarks/search?q=chicken', env, {
      headers: AUTH_HEADERS,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

describe('DELETE /api/v1/bookmarks/:id', () => {
  it('deletes own bookmark', async () => {
    const env = authedEnv({
      bookmarks: [{ id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1', created_at: '2024-01-01' }],
    });

    const res = await bookmarks.request('/api/v1/bookmarks/bk-1', {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 404 for other user bookmark', async () => {
    const env = authedEnv({
      bookmarks: [{ id: 'bk-1', user_id: 'user-2', collection_id: 'col-1', recipe_id: 'r1', created_at: '2024-01-01' }],
    });

    const res = await bookmarks.request('/api/v1/bookmarks/bk-1', {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    }, env);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/bookmarks', () => {
  it('returns paginated bookmarks', async () => {
    const items = [
      { id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
      { id: 'bk-2', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r2', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    const env = authedEnv({ bookmarks: items });
    const res = await req('/api/v1/bookmarks', env, {
      headers: AUTH_HEADERS,
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });
});
