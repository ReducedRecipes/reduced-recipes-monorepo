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
  insertError?: string;
} = {}) {
  const collectionId = overrides.collectionId ?? 'col-1';
  const bookmarksList = overrides.bookmarks ?? [];

  return {
    prepare: vi.fn((sql: string) => {
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
      // DELETE bookmark
      if (sql.includes('DELETE FROM bookmarks')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // SELECT bookmarks list
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

function createMockRecipesDB(hasRecipe = true) {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(hasRecipe ? { id: 'recipe-1' } : null),
      all: vi.fn().mockResolvedValue(makeD1Result()),
    })),
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

function makeAuthD1() {
  // D1 that returns TEST_USER for auth middleware's fetchUser call
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
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

function req(path: string, env: Env, init?: RequestInit) {
  return bookmarks.request(path, init ?? {}, env);
}

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

  it('creates a bookmark successfully', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const usersDB = createMockUsersDB({ collectionId: 'col-1' });
    // Merge auth-user lookup into the mock
    const origPrepare = usersDB.prepare as ReturnType<typeof vi.fn>;
    usersDB.prepare = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      return origPrepare(sql);
    }) as unknown as D1Database['prepare'];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB,
    });

    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; recipe_id: string; collection_id: string };
    expect(body.recipe_id).toBe('recipe-1');
    expect(body.collection_id).toBe('col-1');
    expect(body.id).toBeDefined();
  });

  it('returns 404 when recipe does not exist', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const usersDB = createMockUsersDB();
    const origPrepare = usersDB.prepare as ReturnType<typeof vi.fn>;
    usersDB.prepare = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      return origPrepare(sql);
    }) as unknown as D1Database['prepare'];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB,
      recipesDB: createMockRecipesDB(false),
    });

    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'nonexistent' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(404);
  });

  it('returns 409 on duplicate bookmark', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const usersDB = createMockUsersDB({ insertError: 'UNIQUE constraint failed' });
    const origPrepare = usersDB.prepare as ReturnType<typeof vi.fn>;
    usersDB.prepare = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      return origPrepare(sql);
    }) as unknown as D1Database['prepare'];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB,
    });

    const res = await req('/api/v1/bookmarks', env, {
      method: 'POST',
      body: JSON.stringify({ recipe_id: 'recipe-1' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_BOOKMARKED');
  });
});

describe('DELETE /api/v1/bookmarks/:id', () => {
  it('deletes own bookmark', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const usersDB = createMockUsersDB({
      bookmarks: [{ id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1', created_at: '2024-01-01' }],
    });
    const origPrepare = usersDB.prepare as ReturnType<typeof vi.fn>;
    usersDB.prepare = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      return origPrepare(sql);
    }) as unknown as D1Database['prepare'];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB,
    });

    const res = await bookmarks.request('/api/v1/bookmarks/bk-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 404 for other user bookmark', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const usersDB = createMockUsersDB({
      bookmarks: [{ id: 'bk-1', user_id: 'user-2', collection_id: 'col-1', recipe_id: 'r1', created_at: '2024-01-01' }],
    });
    const origPrepare = usersDB.prepare as ReturnType<typeof vi.fn>;
    usersDB.prepare = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      return origPrepare(sql);
    }) as unknown as D1Database['prepare'];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB,
    });

    const res = await bookmarks.request('/api/v1/bookmarks/bk-1', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/bookmarks', () => {
  it('returns paginated bookmarks', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const items = [
      { id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r1', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
      { id: 'bk-2', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r2', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    const usersDB = createMockUsersDB({ bookmarks: items });
    const origPrepare = usersDB.prepare as ReturnType<typeof vi.fn>;
    usersDB.prepare = vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      return origPrepare(sql);
    }) as unknown as D1Database['prepare'];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB,
    });

    const res = await req('/api/v1/bookmarks', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });
});
