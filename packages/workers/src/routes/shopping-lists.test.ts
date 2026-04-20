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
  itemById?: Record<string, unknown> | null;
  uncheckChanges?: number;
} = {}) {
  const lists = overrides.lists ?? [];
  const listById = overrides.listById === undefined ? null : overrides.listById;
  const existingCount = overrides.existingCount ?? 0;
  const items = overrides.items ?? [];
  const itemById = overrides.itemById === undefined ? null : overrides.itemById;
  const uncheckChanges = overrides.uncheckChanges ?? 0;

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
      // SELECT joined (shared) shopping lists via shopping_list_members
      if (sql.includes('FROM shopping_list_members slm')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result([])),
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
      // INSERT shopping_list_recipes
      if (sql.includes('INSERT INTO shopping_list_recipes')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      // INSERT shopping_list_items
      if (sql.includes('INSERT INTO shopping_list_items')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      // DELETE shopping_list_items (must check before generic DELETE)
      if (sql.includes('DELETE FROM shopping_list_items')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true }),
        };
      }
      // DELETE shopping_list_recipes
      if (sql.includes('DELETE FROM shopping_list_recipes')) {
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
      // UPDATE shopping_list_items (uncheck-all or item update)
      if (sql.includes('UPDATE shopping_list_items')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: uncheckChanges } }),
        };
      }
      // SELECT single item by id and shopping_list_id
      if (sql.includes('FROM shopping_list_items') && sql.includes('WHERE id = ?')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(itemById),
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
        run: vi.fn().mockResolvedValue({ success: true, meta: { changes: 0 } }),
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
    INGREDIENT_PARSE_QUEUE: { send: vi.fn().mockResolvedValue(undefined) } as unknown as Queue,
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
      { id: 'item-1', shopping_list_id: 'list-1', item: 'Milk', original_text: 'Milk', checked: 0, recipe_id: null, quantity: null, unit: null, parse_failed: 0, parsing: 0, source: 'manual', position: 0, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      { id: 'item-2', shopping_list_id: 'list-1', item: 'Bread', original_text: 'Bread', checked: 1, recipe_id: null, quantity: null, unit: null, parse_failed: 0, parsing: 0, source: 'manual', position: 1, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
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

  it('allows deleting default list and promotes next list', async () => {
    const mockList = { id: 'list-1', user_id: 'user-1', name: 'Default', is_default: 1 };
    const env = makeEnv(createMockUsersDB({ listById: mockList }));

    const res = await req('/api/v1/shopping-lists/list-1', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(204);
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

// ── S-8: Recipe and item management tests ──────────────────────────────

const MOCK_LIST = { id: 'list-1', user_id: 'user-1', name: 'Weekly', is_default: 0, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' };

describe('POST /api/v1/shopping-lists/:id/recipes', () => {
  it('adds recipe ingredients with parsing=1 and sends queue job', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST }));

    const res = await req('/api/v1/shopping-lists/list-1/recipes', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ recipe_id: 'recipe-1', ingredients: ['2 cups flour', '1 tsp salt'] }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as { items: { id: string; original_text: string }[] };
    expect(json.items).toHaveLength(2);
    expect(json.items[0]!.original_text).toBe('2 cups flour');
    expect(json.items[1]!.original_text).toBe('1 tsp salt');
    // Verify queue was called
    expect((env as unknown as Record<string, unknown>).INGREDIENT_PARSE_QUEUE).toBeDefined();
  });

  it('returns 400 when ingredients array is empty', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST }));

    const res = await req('/api/v1/shopping-lists/list-1/recipes', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ recipe_id: 'recipe-1', ingredients: [] }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('INVALID_INPUT');
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/recipes', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ recipe_id: 'recipe-1', ingredients: ['flour'] }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/shopping-lists/:id/recipes/:recipe_id', () => {
  it('removes recipe and associated items and returns 204', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST }));

    const res = await req('/api/v1/shopping-lists/list-1/recipes/recipe-1', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/recipes/recipe-1', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/shopping-lists/:id/items', () => {
  it('adds a manual item with parsing=0 and source=manual', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST }));

    const res = await req('/api/v1/shopping-lists/list-1/items', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: '2 cups flour' }),
    });
    expect(res.status).toBe(201);
    const json = await res.json() as Record<string, unknown>;
    expect(json.source).toBe('manual');
    expect(json.parsing).toBe(0);
    expect(json.original_text).toBe('2 cups flour');
    expect(json.recipe_id).toBeNull();
  });

  it('returns 400 when name is empty', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST }));

    const res = await req('/api/v1/shopping-lists/list-1/items', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: '' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('INVALID_INPUT');
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/items', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: 'Milk' }),
    });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/shopping-lists/:id/items/:item_id', () => {
  const MOCK_ITEM = {
    id: 'item-1', shopping_list_id: 'list-1', recipe_id: null,
    original_text: 'Milk', quantity: 1, unit: 'l', item: 'milk',
    checked: 0, parse_failed: 0, parsing: 0, source: 'manual' as const,
    position: 0, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  };

  it('updates item checked status', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, itemById: MOCK_ITEM }));

    const res = await req('/api/v1/shopping-lists/list-1/items/item-1', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ checked: 1 }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.checked).toBe(1);
  });

  it('updates item name', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, itemById: MOCK_ITEM }));

    const res = await req('/api/v1/shopping-lists/list-1/items/item-1', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ name: 'Oat Milk' }),
    });
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.item).toBe('Oat Milk');
    expect(json.original_text).toBe('Oat Milk');
  });

  it('returns 404 when item not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, itemById: null }));

    const res = await req('/api/v1/shopping-lists/list-1/items/nonexistent', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ checked: 1 }),
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/items/item-1', env, {
      method: 'PATCH',
      headers: AUTH_HEADERS,
      body: JSON.stringify({ checked: 1 }),
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/shopping-lists/:id/items/:item_id', () => {
  it('removes item and returns 204', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, itemById: { id: 'item-1' } }));

    const res = await req('/api/v1/shopping-lists/list-1/items/item-1', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 when item not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, itemById: null }));

    const res = await req('/api/v1/shopping-lists/list-1/items/nonexistent', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/items/item-1', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});

// ── S-9: Share routes tests ──────────────────────────────────────────────

describe('POST /api/v1/shopping-lists/:id/share', () => {
  it('generates share token with 7-day expiry', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST }));

    const res = await req('/api/v1/shopping-lists/list-1/share', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { share_token: string; expires_at: string; share_url: string };
    expect(json.share_token).toBeDefined();
    expect(json.share_token.length).toBeGreaterThan(0);
    expect(json.expires_at).toBeDefined();
    expect(json.share_url).toContain(json.share_token);
    // Verify expiry is ~7 days from now
    const expiresAt = new Date(json.expires_at).getTime();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt - now).toBeGreaterThan(sevenDays - 60000);
    expect(expiresAt - now).toBeLessThan(sevenDays + 60000);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/share', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });

  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/shopping-lists/list-1/share', env, { method: 'POST' });
    expect(res.status).toBe(401);
  });
});

describe('POST /api/v1/shopping-lists/:id/share/renew', () => {
  it('renews share token expiry by 7 days', async () => {
    const listWithShare = { ...MOCK_LIST, share_token: 'existing-token', share_expires_at: '2024-01-01T00:00:00Z' };
    const env = makeEnv(createMockUsersDB({ listById: listWithShare }));

    const res = await req('/api/v1/shopping-lists/list-1/share/renew', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { share_token: string; expires_at: string };
    expect(json.share_token).toBe('existing-token');
    expect(json.expires_at).toBeDefined();
    const expiresAt = new Date(json.expires_at).getTime();
    const now = Date.now();
    const sevenDays = 7 * 24 * 60 * 60 * 1000;
    expect(expiresAt - now).toBeGreaterThan(sevenDays - 60000);
  });

  it('returns 400 when no share token exists', async () => {
    const listWithoutShare = { ...MOCK_LIST, share_token: null, share_expires_at: null };
    const env = makeEnv(createMockUsersDB({ listById: listWithoutShare }));

    const res = await req('/api/v1/shopping-lists/list-1/share/renew', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(400);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('NO_SHARE_TOKEN');
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/share/renew', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/shopping-lists/:id/share', () => {
  it('revokes share token and returns 204', async () => {
    const listWithShare = { ...MOCK_LIST, share_token: 'existing-token', share_expires_at: '2025-01-01T00:00:00Z' };
    const env = makeEnv(createMockUsersDB({ listById: listWithShare }));

    const res = await req('/api/v1/shopping-lists/list-1/share', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(204);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/share', env, {
      method: 'DELETE',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/shared/lists/:token', () => {
  it('returns shared list with items when token is valid', async () => {
    const sharedList = {
      id: 'list-1', user_id: 'user-1', name: 'Shared List', is_default: 0,
      share_token: 'valid-share-token', share_expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    };
    const mockItems = [
      { id: 'item-1', shopping_list_id: 'list-1', item: 'Milk', checked: 0 },
      { id: 'item-2', shopping_list_id: 'list-1', item: 'Bread', checked: 1 },
    ];

    // Need a custom mock that handles share_token lookup
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('FROM shopping_lists') && sql.includes('share_token')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(sharedList),
          };
        }
        if (sql.includes('FROM shopping_list_items')) {
          return {
            bind: vi.fn().mockReturnThis(),
            all: vi.fn().mockResolvedValue(makeD1Result(mockItems)),
          };
        }
        // Auth middleware — no user (unauthenticated)
        if (sql.includes('SELECT * FROM users')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
          all: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }),
    } as unknown as D1Database;

    const env = makeEnv(db);
    // No auth headers — public endpoint
    const res = await req('/api/v1/shared/lists/valid-share-token', env);
    expect(res.status).toBe(200);
    const json = await res.json() as Record<string, unknown>;
    expect(json.name).toBe('Shared List');
    const items = json.items as { unchecked: unknown[]; checked: unknown[] };
    expect(items.unchecked).toHaveLength(1);
    expect(items.checked).toHaveLength(1);
  });

  it('returns 404 when token is invalid', async () => {
    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('FROM shopping_lists') && sql.includes('share_token')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        if (sql.includes('SELECT * FROM users')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      }),
    } as unknown as D1Database;

    const env = makeEnv(db);
    const res = await req('/api/v1/shared/lists/invalid-token', env);
    expect(res.status).toBe(404);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('returns 410 when share token is expired', async () => {
    const expiredList = {
      id: 'list-1', user_id: 'user-1', name: 'Expired List', is_default: 0,
      share_token: 'expired-token', share_expires_at: '2020-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
    };

    const db = {
      prepare: vi.fn((sql: string) => {
        if (sql.includes('FROM shopping_lists') && sql.includes('share_token')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(expiredList),
          };
        }
        if (sql.includes('SELECT * FROM users')) {
          return {
            bind: vi.fn().mockReturnThis(),
            first: vi.fn().mockResolvedValue(null),
          };
        }
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(null),
        };
      }),
    } as unknown as D1Database;

    const env = makeEnv(db);
    const res = await req('/api/v1/shared/lists/expired-token', env);
    expect(res.status).toBe(410);
    const json = await res.json() as { error: { code: string } };
    expect(json.error.code).toBe('EXPIRED');
  });
});

describe('POST /api/v1/shopping-lists/:id/uncheck-all', () => {
  it('unchecks all items and returns count', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, uncheckChanges: 3 }));

    const res = await req('/api/v1/shopping-lists/list-1/uncheck-all', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { count: number };
    expect(json.count).toBe(3);
  });

  it('returns count=0 when no items were checked', async () => {
    const env = makeEnv(createMockUsersDB({ listById: MOCK_LIST, uncheckChanges: 0 }));

    const res = await req('/api/v1/shopping-lists/list-1/uncheck-all', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(200);
    const json = await res.json() as { count: number };
    expect(json.count).toBe(0);
  });

  it('returns 404 when list not found', async () => {
    const env = makeEnv(createMockUsersDB({ listById: null }));

    const res = await req('/api/v1/shopping-lists/nonexistent/uncheck-all', env, {
      method: 'POST',
      headers: AUTH_HEADERS,
    });
    expect(res.status).toBe(404);
  });
});
