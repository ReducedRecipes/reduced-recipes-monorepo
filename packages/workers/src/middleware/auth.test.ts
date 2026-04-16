import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import type { Env, User } from '@rr/shared';
import { requireAuth, optionalAuth } from './auth';

// ── Mock helpers ──────────────────────────────────────────────────────────

const testUser: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  picture_url: null,
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    user_id: 'user-1',
    created_at: Date.now(),
    ...overrides,
  };
}

function makeKV(store: Record<string, string> = {}) {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store[key] ?? null)),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  };
}

function makeD1(userRow: Record<string, unknown> | null = testUser as unknown as Record<string, unknown>) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnThis(),
      all: vi.fn().mockResolvedValue({ results: userRow ? [userRow] : [], success: true, meta: {} }),
      first: vi.fn().mockResolvedValue(userRow),
      run: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
      raw: vi.fn().mockResolvedValue([]),
    }),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn(),
    dump: vi.fn(),
  };
}

type AuthEnv = { Bindings: Env; Variables: { userId: string; user: User } };

function createApp() {
  const app = new Hono<AuthEnv>();

  app.get('/protected', requireAuth, (c) => {
    return c.json({ userId: c.get('userId'), user: c.get('user') });
  });

  app.get('/optional', optionalAuth, (c) => {
    const userId = c.get('userId');
    return c.json({ userId: userId ?? null, authenticated: !!userId });
  });

  return app;
}

function createEnv(kvStore: Record<string, string> = {}, userRow: Record<string, unknown> | null = testUser as unknown as Record<string, unknown>) {
  return {
    DB: makeD1() as unknown,
    RECIPES_KV: makeKV() as unknown,
    CACHE_KV: makeKV() as unknown,
    IMAGES_R2: {} as unknown,
    CRAWL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PARSE_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PROJECTION_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    ADMIN_TOKEN: 'test-admin-token',
    BOT_USER_AGENT: 'TestBot/1.0',
    DEFAULT_CRAWL_DELAY_MS: '3000',
    ENVIRONMENT: 'test',
    MAX_QUEUE_BATCH: '10',
    USERS_DB: makeD1(userRow) as unknown,
    SESSION_KV: makeKV(kvStore) as unknown,
    USER_CACHE_KV: makeKV() as unknown,
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'http://localhost/callback',
    SESSION_SECRET: 'test-secret',
  } as unknown as Env;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('requireAuth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const app = createApp();
    const env = createEnv();
    const res = await app.request('/protected', {}, env);
    expect(res.status).toBe(401);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('unauthorized');
  });

  it('returns 401 when session is not found in KV', async () => {
    const app = createApp();
    const env = createEnv(); // empty KV store
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer invalid-token' },
    }, env);
    expect(res.status).toBe(401);
  });

  it('authenticates with a valid Bearer token', async () => {
    const session = makeSession();
    const env = createEnv({
      'session:valid-token': JSON.stringify(session),
    });

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; user: User };
    expect(body.userId).toBe('user-1');
    expect(body.user.email).toBe('test@example.com');
  });

  it('authenticates with a session cookie', async () => {
    const session = makeSession();
    const env = createEnv({
      'session:cookie-token': JSON.stringify(session),
    });

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Cookie: 'session=cookie-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe('user-1');
  });

  it('prefers cookie over Bearer header', async () => {
    const cookieSession = makeSession({ user_id: 'user-cookie' });
    const bearerSession = makeSession({ user_id: 'user-bearer' });

    const kvStore = {
      'session:cookie-token': JSON.stringify(cookieSession),
      'session:bearer-token': JSON.stringify(bearerSession),
    };

    // USERS_DB should return a user for user-cookie
    const env = createEnv(kvStore);

    const app = createApp();
    const res = await app.request('/protected', {
      headers: {
        Cookie: 'session=cookie-token',
        Authorization: 'Bearer bearer-token',
      },
    }, env);

    expect(res.status).toBe(200);
    // KV was queried with cookie-token (cookie takes priority)
    expect((env.SESSION_KV as ReturnType<typeof makeKV>).get).toHaveBeenCalledWith('session:cookie-token');
  });

  it('returns 401 when user is not found in DB', async () => {
    const session = makeSession();
    const env = createEnv(
      { 'session:valid-token': JSON.stringify(session) },
      null, // no user found
    );

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(401);
  });

  it('follows grace-period replacement token', async () => {
    const graceSession = { replacement_token: 'new-token' };
    const realSession = makeSession();

    const env = createEnv({
      'session:old-token': JSON.stringify(graceSession),
      'session:new-token': JSON.stringify(realSession),
    });

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer old-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string };
    expect(body.userId).toBe('user-1');
  });

  it('returns 401 when grace-period replacement token is also invalid', async () => {
    const graceSession = { replacement_token: 'missing-token' };
    const env = createEnv({
      'session:old-token': JSON.stringify(graceSession),
    });

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer old-token' },
    }, env);

    expect(res.status).toBe(401);
  });

  it('triggers token refresh after 7 days', async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    const session = makeSession({ created_at: eightDaysAgo });

    const env = createEnv({
      'session:old-token': JSON.stringify(session),
      'user-sessions:user-1': JSON.stringify(['old-token']),
    });

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer old-token' },
    }, env);

    expect(res.status).toBe(200);

    // SESSION_KV.put should have been called for:
    // 1. New session token
    // 2. Grace period on old token
    // 3. Updated reverse index
    const kvPut = (env.SESSION_KV as ReturnType<typeof makeKV>).put;
    expect(kvPut).toHaveBeenCalled();

    // Should set X-New-Session-Token header for Bearer auth
    const newTokenHeader = res.headers.get('X-New-Session-Token');
    expect(newTokenHeader).toBeTruthy();
  });

  it('does not refresh token within 7 days', async () => {
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const session = makeSession({ created_at: oneDayAgo });

    const env = createEnv({
      'session:fresh-token': JSON.stringify(session),
    });

    const app = createApp();
    const res = await app.request('/protected', {
      headers: { Authorization: 'Bearer fresh-token' },
    }, env);

    expect(res.status).toBe(200);

    // SESSION_KV.put should NOT have been called (no refresh needed)
    const kvPut = (env.SESSION_KV as ReturnType<typeof makeKV>).put;
    expect(kvPut).not.toHaveBeenCalled();
  });
});

describe('optionalAuth middleware', () => {
  it('passes through without token and sets no user', async () => {
    const app = createApp();
    const env = createEnv();

    const res = await app.request('/optional', {}, env);
    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string | null; authenticated: boolean };
    expect(body.authenticated).toBe(false);
    expect(body.userId).toBeNull();
  });

  it('attaches user when valid token is present', async () => {
    const session = makeSession();
    const env = createEnv({
      'session:valid-token': JSON.stringify(session),
    });

    const app = createApp();
    const res = await app.request('/optional', {
      headers: { Authorization: 'Bearer valid-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { userId: string; authenticated: boolean };
    expect(body.authenticated).toBe(true);
    expect(body.userId).toBe('user-1');
  });

  it('continues without user when session is invalid', async () => {
    const env = createEnv(); // empty KV

    const app = createApp();
    const res = await app.request('/optional', {
      headers: { Authorization: 'Bearer bad-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(false);
  });

  it('continues without user when SESSION_KV is not configured', async () => {
    const env = createEnv();
    (env as unknown as Record<string, unknown>).SESSION_KV = undefined;

    const app = createApp();
    const res = await app.request('/optional', {
      headers: { Authorization: 'Bearer any-token' },
    }, env);

    expect(res.status).toBe(200);
    const body = await res.json() as { authenticated: boolean };
    expect(body.authenticated).toBe(false);
  });
});
