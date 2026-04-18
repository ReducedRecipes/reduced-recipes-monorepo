import { describe, it, expect, vi } from 'vitest';
import collections from './collections';
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
  collections?: Record<string, unknown>[];
  existingName?: string | null;
  maxPosition?: number | null;
  collectionById?: Record<string, unknown> | null;
  duplicateNameOnUpdate?: boolean;
  defaultCollection?: { id: string } | null;
  bookmarks?: Record<string, unknown>[];
} = {}) {
  const collectionsList = overrides.collections ?? [];
  const existingName = overrides.existingName ?? null;
  const maxPosition = overrides.maxPosition ?? null;
  const collectionById = overrides.collectionById === undefined ? null : overrides.collectionById;
  const duplicateNameOnUpdate = overrides.duplicateNameOnUpdate ?? false;
  const defaultCollection = overrides.defaultCollection === undefined ? null : overrides.defaultCollection;
  const bookmarksList = overrides.bookmarks ?? [];

  return {
    prepare: vi.fn((sql: string) => {
      // Auth middleware: SELECT * FROM users
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      // SELECT collections list (ORDER BY)
      if (sql.includes('FROM collections') && sql.includes('ORDER BY')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(collectionsList as Record<string, unknown>[])),
        };
      }
      // SELECT collection by id + user_id (PATCH/DELETE/GET bookmarks ownership check)
      if (sql.includes('FROM collections') && sql.includes('WHERE id = ?') && !sql.includes('DELETE') && !sql.includes('UPDATE')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(collectionById),
        };
      }
      // Check duplicate name with id != ? (PATCH rename check)
      if (sql.includes('SELECT id FROM collections') && sql.includes('id != ?')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(duplicateNameOnUpdate ? { id: 'other-col' } : null),
        };
      }
      // Check duplicate name (POST create check)
      if (sql.includes('SELECT id FROM collections') && sql.includes('name')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(existingName ? { id: 'existing-col' } : null),
        };
      }
      // MAX(position)
      if (sql.includes('MAX(position)')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ max_pos: maxPosition }),
        };
      }
      // INSERT collection
      if (sql.includes('INSERT INTO collections')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // UPDATE collections
      if (sql.includes('UPDATE collections')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // DELETE collections
      if (sql.includes('DELETE FROM collections')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // SELECT default collection (is_default = 1)
      if (sql.includes('is_default = 1')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(defaultCollection),
        };
      }
      // UPDATE bookmarks (move to default)
      if (sql.includes('UPDATE bookmarks')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // SELECT bookmarks
      if (sql.includes('FROM bookmarks')) {
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

function makeEnv(opts: {
  usersDB?: D1Database;
  sessionKV?: KVNamespace;
} = {}): Env {
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
    DEFAULT_CRAWL_DELAY_MS: '500',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    SESSION_KV: opts.sessionKV ?? createMockKV(kvStore),
    USERS_DB: opts.usersDB ?? createMockUsersDB(),
  };
}

function req(path: string, env: Env, init?: RequestInit) {
  return collections.request(path, init ?? {}, env);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/collections', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/collections', env);
    expect(res.status).toBe(401);
  });

  it('returns user collections ordered by position', async () => {
    const items = [
      { id: 'col-1', user_id: 'user-1', name: 'Saved', is_default: 1, is_public: 0, position: 0, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
      { id: 'col-2', user_id: 'user-1', name: 'Dinner Ideas', is_default: 0, is_public: 1, position: 1, created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
    ];

    const env = makeEnv({ usersDB: createMockUsersDB({ collections: items }) });

    const res = await req('/api/v1/collections', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toEqual(items[0]);
  });

  it('returns empty array when user has no collections', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collections: [] }) });

    const res = await req('/api/v1/collections', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

describe('POST /api/v1/collections', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({ name: 'My Collection' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 400 if name is missing', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB() });

    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 if name is empty string', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB() });

    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({ name: '   ' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(400);
  });

  it('returns 409 if collection name already exists', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ existingName: 'Saved' }) });

    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({ name: 'Saved' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('ALREADY_EXISTS');
  });

  it('creates a collection successfully', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ maxPosition: 1 }) });

    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({ name: 'Weeknight Dinners' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { id: string; name: string; position: number; is_default: number; is_public: number };
    expect(body.name).toBe('Weeknight Dinners');
    expect(body.position).toBe(2);
    expect(body.is_default).toBe(0);
    expect(body.is_public).toBe(0);
    expect(body.id).toBeDefined();
  });

  it('creates a public collection when is_public is true', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ maxPosition: 0 }) });

    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({ name: 'Public Recipes', is_public: true }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { is_public: number };
    expect(body.is_public).toBe(1);
  });

  it('assigns position 0 when no collections exist', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ maxPosition: null }) });

    const res = await req('/api/v1/collections', env, {
      method: 'POST',
      body: JSON.stringify({ name: 'First Collection' }),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer valid-token',
      },
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { position: number };
    expect(body.position).toBe(0);
  });
});

// ── PATCH /api/v1/collections/:id ─────────────────────────────────────

describe('PATCH /api/v1/collections/:id', () => {
  const existingCol = {
    id: 'col-2', user_id: 'user-1', name: 'Dinner', is_default: 0,
    is_public: 0, position: 1, created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  };

  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 if collection not found', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: null }) });
    const res = await req('/api/v1/collections/nonexistent', env, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'New Name' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 if name is empty', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: existingCol }) });
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'PATCH',
      body: JSON.stringify({ name: '  ' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(400);
  });

  it('returns 409 if renamed name conflicts with another collection', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: existingCol, duplicateNameOnUpdate: true }) });
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Saved' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(409);
  });

  it('updates name successfully', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: existingCol }) });
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Lunch Ideas' }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string; id: string };
    expect(body.name).toBe('Lunch Ideas');
    expect(body.id).toBe('col-2');
  });

  it('updates is_public and position', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: existingCol }) });
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'PATCH',
      body: JSON.stringify({ is_public: true, position: 5 }),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { is_public: number; position: number };
    expect(body.is_public).toBe(1);
    expect(body.position).toBe(5);
  });

  it('returns current state when no fields provided', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: existingCol }) });
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'PATCH',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe('Dinner');
  });
});

// ── DELETE /api/v1/collections/:id ────────────────────────────────────

describe('DELETE /api/v1/collections/:id', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/collections/col-2', env, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('returns 404 if collection not found', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: null }) });
    const res = await req('/api/v1/collections/nonexistent', env, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(404);
  });

  it('returns 400 when trying to delete default collection', async () => {
    const env = makeEnv({
      usersDB: createMockUsersDB({ collectionById: { id: 'col-1', is_default: 1 } }),
    });
    const res = await req('/api/v1/collections/col-1', env, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_INPUT');
  });

  it('deletes collection and migrates bookmarks to default', async () => {
    const env = makeEnv({
      usersDB: createMockUsersDB({
        collectionById: { id: 'col-2', is_default: 0 },
        defaultCollection: { id: 'col-1' },
      }),
    });
    const res = await req('/api/v1/collections/col-2', env, {
      method: 'DELETE',
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(204);
  });
});

// ── GET /api/v1/collections/:id/bookmarks ─────────────────────────────

describe('GET /api/v1/collections/:id/bookmarks', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/collections/col-1/bookmarks', env);
    expect(res.status).toBe(401);
  });

  it('returns 404 if collection not found', async () => {
    const env = makeEnv({ usersDB: createMockUsersDB({ collectionById: null }) });
    const res = await req('/api/v1/collections/nonexistent/bookmarks', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });
    expect(res.status).toBe(404);
  });

  it('returns paginated bookmarks for a collection', async () => {
    const bookmarks = [
      { id: 'bk-1', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r-1', created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-02T00:00:00Z' },
      { id: 'bk-2', user_id: 'user-1', collection_id: 'col-1', recipe_id: 'r-2', created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z' },
    ];

    const env = makeEnv({
      usersDB: createMockUsersDB({
        collectionById: { id: 'col-1' },
        bookmarks,
      }),
    });

    const res = await req('/api/v1/collections/col-1/bookmarks', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });

  it('returns empty array for collection with no bookmarks', async () => {
    const env = makeEnv({
      usersDB: createMockUsersDB({
        collectionById: { id: 'col-1' },
        bookmarks: [],
      }),
    });

    const res = await req('/api/v1/collections/col-1/bookmarks', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(0);
    expect(body.next_cursor).toBeNull();
  });
});
