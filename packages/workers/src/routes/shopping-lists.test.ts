import { describe, it, expect, vi } from 'vitest';
import shoppingLists from './shopping-lists';
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
  lists?: Record<string, unknown>[];
  listById?: Record<string, unknown> | null;
  existingCount?: number;
  items?: Record<string, unknown>[];
} = {}) {
  const lists = overrides.lists ?? [];
  const listById = overrides.listById === undefined ? null : overrides.listById;
  const existingCount = overrides.existingCount ?? 0;
  const items = overrides.items ?? [];

  return {
    prepare: vi.fn((sql: string) => {
      // Auth middleware: SELECT * FROM users
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      // SELECT shopping_lists with subqueries (GET list)
      if (sql.includes('FROM shopping_lists sl') && sql.includes('ORDER BY')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(lists)),
        };
      }
      // COUNT existing lists
      if (sql.includes('COUNT(*)') && sql.includes('shopping_lists')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: existingCount }),
        };
      }
      // INSERT shopping list
      if (sql.includes('INSERT INTO shopping_lists')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      // DELETE shopping list (must be checked before generic SELECT)
      if (sql.includes('DELETE FROM shopping_lists')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      // SELECT single shopping list by id and user_id
      if (sql.includes('FROM shopping_lists') && sql.includes('WHERE id = ?')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(listById),
        };
      }
      // SELECT items for list
      if (sql.includes('FROM shopping_list_items') && sql.includes('WHERE shopping_list_id')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(items)),
        };
      }
      // UPDATE shopping list
      if (sql.includes('UPDATE shopping_lists')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      // Fallback
      return {
        bind: vi.fn().mockReturnThis(),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue(makeD1Result()),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    }),
  } as unknown as D1Database;
}

function makeEnv(usersDB?: D1Database): Env {
  const kvStore = new Map<string, string>();
  kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

  return {
    DB: {} as D1Database,
    RECIPES_KV: {} as KVNamespace,
    CACHE_KV: {} as KVNamespace,
    IMAGES_R2: {} as R2Bucket,
    CRAWL_QUEUE: {} as Queue,
    PARSE_QUEUE: {} as Queue,
    PROJECTION_QUEUE: {} as Queue,
    ADMIN_TOKEN: 'admin',
    BOT_USER_AGENT: 'bot',
    DEFAULT_CRAWL_DELAY_MS: '100',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    USERS_DB: usersDB ?? createMockUsersDB(),
    SESSION_KV: createMockKV(kvStore),
  } as Env;
}

const AUTH_HEADERS = { Authorization: 'Bearer valid-token', 'Content-Type': 'application/json' };

function req(path: string, env: Env, init?: RequestInit) {
  return shoppingLists.request(path, init ?? {}, env);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/shopping-lists', () => {
  it('returns user shopping lists', async () => {
    const mockLists = [
      { id: 'list-1', user_id: 'user-1', name: 'Weekly Shop', is_default: 1, item_count: 5, recipe_count: 2, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];
    const env = makeEnv(createMockUsersDB({ lists: mockLists }));

    const res = await req('/api/v1/shopping-lists', env, { headers: AUTH_HEADERS });
    expect(res.status).toBe(200);
    const json = await res.json() as { items: unknown[] };
    expect(json.items).toHaveLength(1);
    expect((json.items[0] as Record<string, unknown>).name).toBe('Weekly Shop');
  });

  it('returns empty array when no lists', async () => {
    const env = makeEnv(createMockUsersDB({ lists: [] }));

    const res = await req('/api/v1/shopping-lists', env, { headers: AUTH_HEADERS });
    expect(res.status).toBe(200);
    const json = await res.json() as { items: unknown[] };
    expect(json.items).toHaveLength(0);
  });

  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/shopping-lists', env);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/shopping-lists', () => {
  it('creates first list with is_default=1', async () => {
    const env = makeEnv(createMockUsersDB({ existingCount: 0 }));

    const res = await req('/api/v1/shopping-lists', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: 'First List' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as Record<string, unknown>;
    expect(json.name).toBe('First List');
    expect(json.is_default).toBe(1);
  });

  it('creates subsequent list with is_default=0', async () => {
    const env = makeEnv(createMockUsersDB({ existingCount: 1 }));

    const res = await req('/api/v1/shopping-lists', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: 'Second List' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as Record<string, unknown>;
    expect(json.name).toBe('Second List');
    expect(json.is_default).toBe(0);
  });

  it('uses default name when none provided', async () => {
    const env = makeEnv(createMockUsersDB({ existingCount: 0 }));

    const res = await req('/api/v1/shopping-lists', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as Record<string, unknown>;
    expect(json.name).toBe('My Shopping List');
  });
});

describe('GET /api/v1/shopping-lists/:id', () => {
  it('returns list with items split into checked/unchecked', async () => {
    const mockList = { id: 'list-1', user_id: 'user-1', name: 'Weekly', is_default: 1, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    const mockItems = [
      { id: 'item-1', shopping_list_id: 'list-1', name: 'Milk', checked: 0, created_at: '2024-01-01T00:00:00Z' },
      { id: 'item-2', shopping_list_id: 'list-1', name: 'Bread', checked: 1, created_at: '2024-01-01T00:00:00Z' },
    ];
    const env = makeEnv(createMockUsersDB({ listById: mockList, items: mockItems }));

    const res = await req('/api/v1/shopping-lists/list-1', env, { headers: AUTH_HEADERS });
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.name).toBe('Weekly');
    const items = json.items as { unchecked: unknown[]; checked: unknown[] };
    expect(items.unchecked).toHaveLength(1);
    expect(items.checked).toHaveLength(1);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent', env, { headers: AUTH_HEADERS });
    expect(res.status).toBe(404);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('NOT_FOUND');
  });
});

describe('PATCH /api/v1/shopping-lists/:id', () => {
  it('updates list name', async () => {
    const mockList = { id: 'list-1', user_id: 'user-1', name: 'Old Name', is_default: 0, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };
    const env = makeEnv(createMockUsersDB({ listById: mockList }));

    const res = await req('/api/v1/shopping-lists/list-1', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.name).toBe('New Name');
  });

  it('returns 400 when name is empty', async () => {
    const env = makeEnv(createMockUsersDB({ listById: { id: 'list-1', user_id: 'user-1' } }));

    const res = await req('/api/v1/shopping-lists/list-1', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('INVALID_INPUT');
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/shopping-lists/:id', () => {
  it('deletes a non-default list and returns 204', async () => {
    const mockList = { id: 'list-2', user_id: 'user-1', name: 'Extra List', is_default: 0 };
    const env = makeEnv(createMockUsersDB({ listById: mockList }));

    const res = await req('/api/v1/shopping-lists/list-2', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(204);
  });

  it('returns 400 when trying to delete default list', async () => {
    const mockList = { id: 'list-1', user_id: 'user-1', name: 'Default', is_default: 1 };
    const env = makeEnv(createMockUsersDB({ listById: mockList }));

    const res = await req('/api/v1/shopping-lists/list-1', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('CANNOT_DELETE_DEFAULT');
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});
