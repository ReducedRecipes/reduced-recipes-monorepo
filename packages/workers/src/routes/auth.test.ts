import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env, User } from '@rr/shared';
import auth from './auth';

// ── Mock helpers ─────────────────────────────────────────────────────────

const TEST_USER: User = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  picture_url: 'https://example.com/photo.jpg',
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function createMockKV(store = new Map<string, string>()) {
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
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

function createMockD1(firstResult: unknown = TEST_USER) {
  const runResult = { results: [], success: true, meta: {} };
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue(firstResult),
        all: vi.fn().mockResolvedValue({ results: firstResult ? [firstResult] : [], success: true, meta: {} }),
        run: vi.fn().mockResolvedValue(runResult),
      }),
    })),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn(),
    dump: vi.fn(),
  } as unknown as D1Database;
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}): Env {
  return {
    DB: createMockD1(),
    RECIPES_KV: createMockKV() as unknown as KVNamespace,
    CACHE_KV: createMockKV() as unknown as KVNamespace,
    IMAGES_R2: {} as unknown as R2Bucket,
    CRAWL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } as unknown as Queue,
    PARSE_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } as unknown as Queue,
    PROJECTION_QUEUE: { send: vi.fn(), sendBatch: vi.fn() } as unknown as Queue,
    ADMIN_TOKEN: 'test-admin-token',
    BOT_USER_AGENT: 'TestBot/1.0',
    DEFAULT_CRAWL_DELAY_MS: '3000',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    USERS_DB: createMockD1(),
    SESSION_KV: createMockKV(),
    USER_CACHE_KV: createMockKV() as unknown as KVNamespace,
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'https://example.com/callback',
    SESSION_SECRET: 'test-session-secret-key-that-is-long-enough',
    ...overrides,
  } as unknown as Env;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('Auth Routes', () => {
  describe('GET /api/v1/auth/google/url', () => {
    it('returns a Google OAuth URL with PKCE params', async () => {
      const env = createEnv();
      const res = await auth.request('/api/v1/auth/google/url', {}, env);

      expect(res.status).toBe(200);
      const body = (await res.json()) as { url: string };
      expect(body.url).toBeDefined();

      const url = new URL(body.url);
      expect(url.hostname).toBe('accounts.google.com');
      expect(url.searchParams.get('client_id')).toBe('test-client-id');
      expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/callback');
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('scope')).toContain('openid');
      expect(url.searchParams.get('code_challenge')).toBeTruthy();
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
      expect(url.searchParams.get('state')).toBeTruthy();
    });

    it('stores auth state in SESSION_KV with auth-state: prefix', async () => {
      const kvStore = new Map<string, string>();
      const sessionKV = createMockKV(kvStore);
      const env = createEnv({ SESSION_KV: sessionKV });

      await auth.request('/api/v1/auth/google/url?platform=mobile&return_to=/profile', {}, env);

      // Verify KV put was called with auth-state: prefix
      const putMock = sessionKV.put as unknown as ReturnType<typeof vi.fn>;
      expect(putMock).toHaveBeenCalled();
      const putCall = putMock.mock.calls[0]!;
      expect(putCall[0]).toMatch(/^auth-state:/);

      // Verify stored data contains platform and return_to
      const storedData = JSON.parse(putCall[1] as string);
      expect(storedData.platform).toBe('mobile');
      expect(storedData.return_to).toBe('/profile');
      expect(storedData.code_verifier).toBeTruthy();
    });

    it('returns 500 when auth is not configured', async () => {
      const env = createEnv({
        SESSION_SECRET: undefined,
        GOOGLE_CLIENT_ID: undefined,
      });

      const res = await auth.request('/api/v1/auth/google/url', {}, env);
      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/v1/auth/google/callback', () => {
    it('returns 400 when code or state is missing', async () => {
      const env = createEnv();

      const res1 = await auth.request('/api/v1/auth/google/callback', {}, env);
      expect(res1.status).toBe(400);

      const res2 = await auth.request('/api/v1/auth/google/callback?code=abc', {}, env);
      expect(res2.status).toBe(400);

      const res3 = await auth.request('/api/v1/auth/google/callback?state=abc', {}, env);
      expect(res3.status).toBe(400);
    });

    it('returns 400 for invalid state HMAC', async () => {
      const env = createEnv();

      const res = await auth.request(
        '/api/v1/auth/google/callback?code=test-code&state=invalid.state',
        {},
        env,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_STATE');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('returns 401 without auth', async () => {
      const env = createEnv();
      const res = await auth.request('/api/v1/auth/logout', { method: 'POST' }, env);
      expect(res.status).toBe(401);
    });

    it('clears session and returns ok with valid auth', async () => {
      const kvStore = new Map<string, string>();
      const sessionToken = 'test-session-token';
      kvStore.set(`session:${sessionToken}`, JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));
      kvStore.set('user-sessions:user-1', JSON.stringify([sessionToken]));

      const sessionKV = createMockKV(kvStore);
      const usersDB = createMockD1(TEST_USER);
      const env = createEnv({ SESSION_KV: sessionKV, USERS_DB: usersDB });

      const res = await auth.request(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        },
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify session was deleted
      expect(sessionKV.delete).toHaveBeenCalledWith(`session:${sessionToken}`);
    });

    it('sets cookie with Max-Age=0 to clear it', async () => {
      const kvStore = new Map<string, string>();
      const sessionToken = 'test-session-token';
      kvStore.set(`session:${sessionToken}`, JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));
      kvStore.set('user-sessions:user-1', JSON.stringify([sessionToken]));

      const sessionKV = createMockKV(kvStore);
      const usersDB = createMockD1(TEST_USER);
      const env = createEnv({ SESSION_KV: sessionKV, USERS_DB: usersDB });

      const res = await auth.request(
        '/api/v1/auth/logout',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
        env,
      );

      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toContain('session=');
      expect(setCookieHeader).toContain('Max-Age=0');
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns 401 without auth', async () => {
      const env = createEnv();
      const res = await auth.request('/api/v1/auth/me', {}, env);
      expect(res.status).toBe(401);
    });

    it('returns user object with valid auth', async () => {
      const kvStore = new Map<string, string>();
      const sessionToken = 'test-session-token';
      kvStore.set(`session:${sessionToken}`, JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

      const sessionKV = createMockKV(kvStore);
      const usersDB = createMockD1(TEST_USER);
      const env = createEnv({ SESSION_KV: sessionKV, USERS_DB: usersDB });

      const res = await auth.request(
        '/api/v1/auth/me',
        {
          headers: { Authorization: `Bearer ${sessionToken}` },
        },
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: User };
      expect(body.user).toBeDefined();
      expect(body.user.id).toBe('user-1');
      expect(body.user.email).toBe('test@example.com');
    });

    it('works with cookie-based auth', async () => {
      const kvStore = new Map<string, string>();
      const sessionToken = 'test-session-token';
      kvStore.set(`session:${sessionToken}`, JSON.stringify({ user_id: 'user-1', created_at: Date.now() }));

      const sessionKV = createMockKV(kvStore);
      const usersDB = createMockD1(TEST_USER);
      const env = createEnv({ SESSION_KV: sessionKV, USERS_DB: usersDB });

      const res = await auth.request(
        '/api/v1/auth/me',
        {
          headers: { Cookie: `session=${sessionToken}` },
        },
        env,
      );

      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: User };
      expect(body.user.id).toBe('user-1');
    });
  });
});
