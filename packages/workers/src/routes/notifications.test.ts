import { describe, it, expect, vi } from 'vitest';
import notifications from './notifications';
import type { Env, User } from '@rr/shared';

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

function createMockUsersDB(opts: {
  notifications?: Record<string, unknown>[];
  notificationById?: Record<string, unknown> | null;
  unreadCount?: number;
} = {}) {
  const notifList = opts.notifications ?? [];
  const unreadCount = opts.unreadCount ?? 0;

  return {
    prepare: vi.fn((sql: string) => {
      // Auth middleware user lookup
      if (sql.includes('SELECT * FROM users')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue(TEST_USER),
        };
      }
      // SELECT notification by id (for mark read)
      if (sql.includes('SELECT id FROM notifications WHERE id')) {
        return {
          bind: vi.fn((...args: string[]) => ({
            first: vi.fn().mockResolvedValue(
              opts.notificationById !== undefined
                ? opts.notificationById
                : notifList.find((n) => n.id === args[0] && n.user_id === args[1]) ?? null,
            ),
          })),
        };
      }
      // UPDATE notifications (mark read / read-all)
      if (sql.includes('UPDATE notifications')) {
        return {
          bind: vi.fn().mockReturnThis(),
          run: vi.fn().mockResolvedValue(makeD1Result()),
        };
      }
      // SELECT COUNT unread
      if (sql.includes('COUNT(*)') && sql.includes('notifications')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ count: unreadCount }),
        };
      }
      // SELECT notifications list
      if (sql.includes('FROM notifications') && sql.includes('ORDER BY')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(notifList as Record<string, unknown>[])),
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

function makeEnv(opts: { usersDB?: D1Database; sessionKV?: KVNamespace } = {}): Env {
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
  return notifications.request(path, init ?? {}, env);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/notifications', () => {
  it('returns 401 without auth', async () => {
    const env = makeEnv();
    const res = await req('/api/v1/notifications', env);
    expect(res.status).toBe(401);
  });

  it('returns paginated notifications', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const items = [
      { id: 'n-1', user_id: 'user-1', type: 'welcome', payload: '{}', read: 0, created_at: '2024-01-02T00:00:00Z' },
      { id: 'n-2', user_id: 'user-1', type: 'recipe_added', payload: '{}', read: 1, created_at: '2024-01-01T00:00:00Z' },
    ];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB({ notifications: items }),
    });

    const res = await req('/api/v1/notifications', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });

  it('returns empty list when no notifications', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB({ notifications: [] }),
    });

    const res = await req('/api/v1/notifications', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(0);
  });
});

describe('POST /api/v1/notifications/:id/read', () => {
  it('marks notification as read', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const notifs = [
      { id: 'n-1', user_id: 'user-1', type: 'welcome', payload: '{}', read: 0, created_at: '2024-01-01' },
    ];

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB({ notifications: notifs }),
    });

    const res = await notifications.request('/api/v1/notifications/n-1/read', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('returns 404 for non-existent notification', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB({ notificationById: null }),
    });

    const res = await notifications.request('/api/v1/notifications/nonexistent/read', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(404);
  });
});

describe('POST /api/v1/notifications/read-all', () => {
  it('marks all as read', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB(),
    });

    const res = await notifications.request('/api/v1/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  it('returns unread count', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB({ unreadCount: 5 }),
    });

    const res = await req('/api/v1/notifications/unread-count', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(body.count).toBe(5);
  });

  it('returns 0 when no unread notifications', async () => {
    const kvStore = new Map<string, string>();
    kvStore.set('session:valid-token', JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

    const env = makeEnv({
      sessionKV: createMockKV(kvStore),
      usersDB: createMockUsersDB({ unreadCount: 0 }),
    });

    const res = await req('/api/v1/notifications/unread-count', env, {
      headers: { Authorization: 'Bearer valid-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(body.count).toBe(0);
  });
});
