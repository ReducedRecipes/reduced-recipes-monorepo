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
} = {}) {
  const collectionsList = overrides.collections ?? [];
  const existingName = overrides.existingName ?? null;
  const maxPosition = overrides.maxPosition ?? null;

  return {
    prepare: vi.fn((sql: string) => {
      // Auth middleware: SELECT * FROM users
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      // SELECT collections list
      if (sql.includes('FROM collections') && sql.includes('ORDER BY')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(collectionsList as Record<string, unknown>[])),
        };
      }
      // Check duplicate name
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
