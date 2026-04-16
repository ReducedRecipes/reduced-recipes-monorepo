import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from '../api';

// ── Mock helpers ─────────────────────────────────────────────────────────

function makeD1Result(results: Record<string, unknown>[] = []): D1Result {
  return { results, success: true, meta: {} as unknown as D1Meta & Record<string, unknown> } as D1Result;
}

function makeStmt(results: Record<string, unknown>[] = []) {
  return {
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue(makeD1Result(results)),
    first: vi.fn().mockResolvedValue(results[0] ?? null),
    run: vi.fn().mockResolvedValue(makeD1Result()),
    raw: vi.fn().mockResolvedValue([]),
  };
}

function makeKV(store: Map<string, string> = new Map()) {
  return {
    get: vi.fn().mockImplementation(async (key: string) => store.get(key) ?? null),
    put: vi.fn().mockImplementation(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn().mockImplementation(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
  };
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  const defaultStmt = makeStmt();
  return {
    DB: {
      prepare: vi.fn().mockReturnValue(defaultStmt),
      batch: vi.fn().mockResolvedValue([]),
      exec: vi.fn(),
      dump: vi.fn(),
    },
    USERS_DB: {
      prepare: vi.fn().mockReturnValue(defaultStmt),
      batch: vi.fn().mockResolvedValue([]),
      exec: vi.fn(),
      dump: vi.fn(),
    },
    RECIPES_KV: {
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
      getWithMetadata: vi.fn(),
    },
    CACHE_KV: { get: vi.fn(), put: vi.fn(), delete: vi.fn(), list: vi.fn(), getWithMetadata: vi.fn() },
    SESSION_KV: makeKV(),
    USER_CACHE_KV: makeKV(),
    IMAGES_R2: {} as unknown,
    CRAWL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PARSE_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PROJECTION_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    ADMIN_TOKEN: 'test-admin-token',
    BOT_USER_AGENT: 'TestBot/1.0',
    DEFAULT_CRAWL_DELAY_MS: '3000',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'https://example.com/auth/callback',
    SESSION_SECRET: 'test-session-secret-key',
    ...overrides,
  };
}

// ── Helper to seed a valid session in KV ─────────────────────────────────

async function seedSession(env: ReturnType<typeof createEnv>, token: string, userId: string) {
  const user = {
    id: userId,
    email: 'test@example.com',
    name: 'Test User',
    picture_url: 'https://example.com/pic.jpg',
    profile_public: 1,
    tier: 'free',
    created_at: new Date().toISOString(),
  };
  const sessionData = { user_id: userId, user, created_at: new Date().toISOString() };
  await env.SESSION_KV.put(`session:${token}`, JSON.stringify(sessionData));
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/auth/google/url', () => {
  it('returns a Google OAuth URL with PKCE params', async () => {
    const env = createEnv();
    const res = await app.request('/api/v1/auth/google/url', {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { url: string };
    expect(body.url).toContain('accounts.google.com/o/oauth2/v2/auth');
    expect(body.url).toContain('client_id=test-client-id');
    expect(body.url).toContain('code_challenge=');
    expect(body.url).toContain('code_challenge_method=S256');
    expect(body.url).toContain('response_type=code');
    expect(body.url).toContain('scope=openid+email+profile');
  });

  it('stores auth state in SESSION_KV with TTL', async () => {
    const env = createEnv();
    await app.request('/api/v1/auth/google/url?platform=mobile&return_to=/dashboard', {}, env);

    expect(env.SESSION_KV.put).toHaveBeenCalled();
    const putCalls = env.SESSION_KV.put.mock.calls as [string, string, { expirationTtl: number }][];
    const authStateCall = putCalls.find((c) => c[0].startsWith('auth-state:'));
    expect(authStateCall).toBeDefined();
    expect(authStateCall![2]).toEqual({ expirationTtl: 600 });

    const stored = JSON.parse(authStateCall![1]);
    expect(stored.platform).toBe('mobile');
    expect(stored.return_to).toBe('/dashboard');
    expect(stored.code_verifier).toBeDefined();
  });

  it('uses default platform=web and return_to=/', async () => {
    const env = createEnv();
    await app.request('/api/v1/auth/google/url', {}, env);

    const putCalls = env.SESSION_KV.put.mock.calls as [string, string, unknown][];
    const authStateCall = putCalls.find((c) => c[0].startsWith('auth-state:'));
    const stored = JSON.parse(authStateCall![1]);
    expect(stored.platform).toBe('web');
    expect(stored.return_to).toBe('/');
  });
});

describe('GET /api/v1/auth/google/callback', () => {
  it('returns 400 if code or state is missing', async () => {
    const env = createEnv();
    const res = await app.request('/api/v1/auth/google/callback', {}, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_REQUEST');
  });

  it('returns 400 for invalid state signature', async () => {
    const env = createEnv();
    const res = await app.request(
      '/api/v1/auth/google/callback?code=test-code&state=bad-nonce.bad-sig',
      {},
      env,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('returns 400 for malformed state without dot', async () => {
    const env = createEnv();
    const res = await app.request(
      '/api/v1/auth/google/callback?code=test-code&state=nodot',
      {},
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await app.request('/api/v1/auth/logout', { method: 'POST' }, env);
    expect(res.status).toBe(401);
  });

  it('deletes session and returns ok with valid auth', async () => {
    const env = createEnv();
    const token = 'test-session-token.abc123';
    await seedSession(env, token, 'user-1');

    const res = await app.request(
      '/api/v1/auth/logout',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(env.SESSION_KV.delete).toHaveBeenCalledWith(`session:${token}`);
  });

  it('clears session cookie on logout', async () => {
    const env = createEnv();
    const token = 'test-session-token.abc123';
    await seedSession(env, token, 'user-1');

    const res = await app.request(
      '/api/v1/auth/logout',
      {
        method: 'POST',
        headers: {
          Cookie: `session=${token}`,
        },
      },
      env,
    );

    expect(res.status).toBe(200);
    const setCookieHeader = res.headers.get('Set-Cookie');
    expect(setCookieHeader).toContain('session=');
    expect(setCookieHeader).toContain('Max-Age=0');
  });
});

describe('GET /api/v1/auth/me', () => {
  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await app.request('/api/v1/auth/me', {}, env);
    expect(res.status).toBe(401);
  });

  it('returns user profile with valid session', async () => {
    const env = createEnv();
    const token = 'me-session-token.def456';
    await seedSession(env, token, 'user-2');

    const res = await app.request(
      '/api/v1/auth/me',
      {
        headers: { Authorization: `Bearer ${token}` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string; email: string } };
    expect(body.user.id).toBe('user-2');
    expect(body.user.email).toBe('test@example.com');
  });

  it('works with cookie-based auth', async () => {
    const env = createEnv();
    const token = 'cookie-session.ghi789';
    await seedSession(env, token, 'user-3');

    const res = await app.request(
      '/api/v1/auth/me',
      {
        headers: { Cookie: `session=${token}` },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    expect(body.user.id).toBe('user-3');
  });
});

describe('Auth middleware - extractToken', () => {
  it('prefers cookie over Bearer header', async () => {
    const env = createEnv();
    const cookieToken = 'cookie-token.aaa';
    const bearerToken = 'bearer-token.bbb';
    await seedSession(env, cookieToken, 'user-cookie');
    await seedSession(env, bearerToken, 'user-bearer');

    const res = await app.request(
      '/api/v1/auth/me',
      {
        headers: {
          Cookie: `session=${cookieToken}`,
          Authorization: `Bearer ${bearerToken}`,
        },
      },
      env,
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { user: { id: string } };
    // Cookie should take precedence
    expect(body.user.id).toBe('user-cookie');
  });

  it('returns 401 for expired/missing session', async () => {
    const env = createEnv();
    const res = await app.request(
      '/api/v1/auth/me',
      {
        headers: { Authorization: 'Bearer nonexistent-token.xyz' },
      },
      env,
    );
    expect(res.status).toBe(401);
  });
});

describe('Auth middleware - session refresh', () => {
  it('refreshes token after 7 days', async () => {
    const env = createEnv();
    const oldToken = 'old-session.aaa';
    const user = {
      id: 'user-refresh',
      email: 'refresh@example.com',
      name: 'Refresh User',
      picture_url: null,
      profile_public: 1,
      tier: 'free',
      created_at: '2024-01-01T00:00:00Z',
    };
    // Created 8 days ago
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const sessionData = { user_id: 'user-refresh', user, created_at: eightDaysAgo };
    await env.SESSION_KV.put(`session:${oldToken}`, JSON.stringify(sessionData));

    const res = await app.request(
      '/api/v1/auth/me',
      {
        headers: { Authorization: `Bearer ${oldToken}` },
      },
      env,
    );

    expect(res.status).toBe(200);

    // Should have created a new session and updated the old one with replacement_token
    const putCalls = env.SESSION_KV.put.mock.calls as [string, string, unknown][];
    // At least 3 puts: initial seed, new session, graced old session, reverse index
    const newSessionPut = putCalls.find(
      (c) => c[0].startsWith('session:') && c[0] !== `session:${oldToken}`,
    );
    expect(newSessionPut).toBeDefined();

    // Old session should have replacement_token
    const gracedPut = putCalls.find((c) => c[0] === `session:${oldToken}` && c !== putCalls[0]);
    if (gracedPut) {
      const graced = JSON.parse(gracedPut[1]);
      expect(graced.replacement_token).toBeDefined();
    }
  });
});
