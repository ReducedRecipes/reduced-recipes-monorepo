import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env, User } from '@rr/shared';
import { requireAuth, optionalAuth } from '../auth';

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

function createMockKV(store = new Map<string, string>()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string, _opts?: unknown) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
    _store: store,
  } as unknown as KVNamespace & { _store: Map<string, string> };
}

function createMockD1(user: User | null = TEST_USER) {
  const first = vi.fn(async () => user);
  const bind = vi.fn(() => ({ first }));
  const prepare = vi.fn(() => ({ bind }));
  return {
    prepare,
    _bind: bind,
    _first: first,
  } as unknown as D1Database & { _bind: ReturnType<typeof vi.fn>; _first: ReturnType<typeof vi.fn> };
}

function makeSession(userId: string, createdAt = Date.now()) {
  return JSON.stringify({ user_id: userId, created_at: createdAt });
}

function createApp(middleware: typeof requireAuth | typeof optionalAuth) {
  const app = new Hono<{ Bindings: Env; Variables: { userId: string; user: User } }>();
  app.use('/test', middleware);
  app.get('/test', (c) => {
    const userId = c.get('userId');
    const user = c.get('user');
    return c.json({ userId: userId ?? null, user: user ?? null });
  });
  return app;
}

function makeEnv(sessionKV: KVNamespace, usersDB: D1Database): Env {
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
    SESSION_KV: sessionKV,
    USERS_DB: usersDB,
  };
}

// ── requireAuth tests ───────────────────────────────────────────────────

describe('requireAuth', () => {
  let kv: ReturnType<typeof createMockKV>;
  let db: ReturnType<typeof createMockD1>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    kv = createMockKV();
    db = createMockD1();
    app = createApp(requireAuth);
    vi.restoreAllMocks();
  });

  it('returns 401 when no token provided', async () => {
    const res = await app.request('/test', {}, makeEnv(kv, db));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 401 for expired/unknown session', async () => {
    const res = await app.request(
      '/test',
      { headers: { Authorization: 'Bearer bad-token' } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(401);
  });

  it('sets userId and user for valid Bearer token', async () => {
    const token = 'valid-token.abc';
    kv._store.set(`session:${token}`, makeSession('user-1'));

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
    expect(body.user.email).toBe('test@example.com');
  });

  it('sets userId and user for valid session cookie', async () => {
    const token = 'cookie-token.def';
    kv._store.set(`session:${token}`, makeSession('user-1'));

    const res = await app.request(
      '/test',
      { headers: { Cookie: `session=${token}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
  });

  it('prefers cookie over Bearer header', async () => {
    const cookieToken = 'cookie-tok.111';
    const bearerToken = 'bearer-tok.222';
    kv._store.set(`session:${cookieToken}`, makeSession('user-cookie'));
    kv._store.set(`session:${bearerToken}`, makeSession('user-bearer'));

    // Mock DB to return different users based on ID
    const dbMulti = createMockD1();
    dbMulti._first.mockImplementation(async () => ({
      ...TEST_USER,
      id: 'user-cookie',
    }));

    const res = await app.request(
      '/test',
      {
        headers: {
          Cookie: `session=${cookieToken}`,
          Authorization: `Bearer ${bearerToken}`,
        },
      },
      makeEnv(kv, dbMulti),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-cookie');
  });

  it('returns 401 when user not found in DB', async () => {
    const token = 'tok.abc';
    kv._store.set(`session:${token}`, makeSession('user-gone'));
    const dbNoUser = createMockD1(null);

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(kv, dbNoUser),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe('unauthorized');
  });

  it('follows grace-period replacement token', async () => {
    const oldToken = 'old-tok.aaa';
    const newToken = 'new-tok.bbb';
    kv._store.set(
      `session:${oldToken}`,
      JSON.stringify({ replacement_token: newToken }),
    );
    kv._store.set(`session:${newToken}`, makeSession('user-1'));

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${oldToken}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
  });

  it('refreshes session older than 7 days and sets X-New-Session-Token header', async () => {
    const token = 'old-session.ccc';
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    kv._store.set(`session:${token}`, makeSession('user-1', eightDaysAgo));
    kv._store.set('user-sessions:user-1', JSON.stringify([token]));

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);

    // Old token should now point to replacement
    const oldSession = JSON.parse(kv._store.get(`session:${token}`) ?? '{}');
    expect(oldSession.replacement_token).toBeDefined();

    // New session token header should be set
    expect(res.headers.get('X-New-Session-Token')).toBeTruthy();
  });

  it('does not refresh session younger than 7 days', async () => {
    const token = 'fresh-session.ddd';
    kv._store.set(`session:${token}`, makeSession('user-1', Date.now()));
    kv._store.set('user-sessions:user-1', JSON.stringify([token]));

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('X-New-Session-Token')).toBeNull();

    // Session should be unchanged
    const session = JSON.parse(kv._store.get(`session:${token}`)!);
    expect(session.user_id).toBe('user-1');
  });

  it('refreshes via cookie and sets Set-Cookie header', async () => {
    const token = 'cookie-old.eee';
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    kv._store.set(`session:${token}`, makeSession('user-1', eightDaysAgo));
    kv._store.set('user-sessions:user-1', JSON.stringify([token]));

    const res = await app.request(
      '/test',
      { headers: { Cookie: `session=${token}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);

    // Should have Set-Cookie header with new token
    const setCookie = res.headers.get('Set-Cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
  });
});

// ── optionalAuth tests ──────────────────────────────────────────────────

describe('optionalAuth', () => {
  let kv: ReturnType<typeof createMockKV>;
  let db: ReturnType<typeof createMockD1>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    kv = createMockKV();
    db = createMockD1();
    app = createApp(optionalAuth);
    vi.restoreAllMocks();
  });

  it('proceeds without user when no token provided', async () => {
    const res = await app.request('/test', {}, makeEnv(kv, db));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeNull();
    expect(body.user).toBeNull();
  });

  it('proceeds without user when session is expired', async () => {
    const res = await app.request(
      '/test',
      { headers: { Authorization: 'Bearer expired.token' } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeNull();
  });

  it('attaches user when valid token present', async () => {
    const token = 'opt-token.fff';
    kv._store.set(`session:${token}`, makeSession('user-1'));

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
    expect(body.user.email).toBe('test@example.com');
  });

  it('proceeds without user when user not found in DB', async () => {
    const token = 'opt-token.ggg';
    kv._store.set(`session:${token}`, makeSession('user-gone'));
    const dbNoUser = createMockD1(null);

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${token}` } },
      makeEnv(kv, dbNoUser),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeNull();
  });

  it('proceeds without blocking when SESSION_KV not configured', async () => {
    const env = makeEnv(kv, db);
    delete (env as Partial<Env>).SESSION_KV;

    const res = await app.request('/test', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBeNull();
  });

  it('follows grace-period replacement token', async () => {
    const oldToken = 'opt-old.hhh';
    const newToken = 'opt-new.iii';
    kv._store.set(
      `session:${oldToken}`,
      JSON.stringify({ replacement_token: newToken }),
    );
    kv._store.set(`session:${newToken}`, makeSession('user-1'));

    const res = await app.request(
      '/test',
      { headers: { Authorization: `Bearer ${oldToken}` } },
      makeEnv(kv, db),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.userId).toBe('user-1');
  });
});
