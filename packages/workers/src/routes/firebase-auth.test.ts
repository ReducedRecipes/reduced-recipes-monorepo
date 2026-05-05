// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '@rr/shared/env';
import firebaseAuth from './firebase-auth';
import { mintToken, getTestPublicKeySpki, TEST_KID, TEST_PROJECT_ID } from '../lib/__tests__/__fixtures__/firebase-tokens';

interface FakeRow { [k: string]: unknown }

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
  } as unknown as KVNamespace;
}

function createMockD1(rows: Record<string, FakeRow | null> = {}) {
  // Simple key-by-(sql, binds) mock for deterministic tests.
  // Tests pre-seed rows for the queries they exercise.
  const calls: { sql: string; binds: unknown[] }[] = [];
  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...binds: unknown[]) => {
        calls.push({ sql, binds });
        return {
          first: vi.fn().mockResolvedValue(rows[`${sql}::${JSON.stringify(binds)}`] ?? null),
          all: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
          run: vi.fn().mockResolvedValue({ results: [], success: true, meta: {} }),
        };
      }),
    })),
    batch: vi.fn().mockResolvedValue([]),
    exec: vi.fn(),
    dump: vi.fn(),
    _calls: calls,
  } as unknown as D1Database & { _calls: typeof calls };
}

async function setupEnv(seedDbRows: Record<string, FakeRow | null> = {}) {
  const spki = await getTestPublicKeySpki();
  const cacheKv = createMockKV();
  // Pre-seed the JWKS cache so we don't need to mock fetch.
  await cacheKv.put('firebase-jwks', JSON.stringify({ keys: { [TEST_KID]: spki } }));

  const env = {
    USERS_DB: createMockD1(seedDbRows),
    SESSION_KV: createMockKV(),
    CACHE_KV: cacheKv,
    FIREBASE_PROJECT_ID: TEST_PROJECT_ID,
  } as unknown as Env;

  return env;
}

async function postCallback(env: Env, idToken: string) {
  return firebaseAuth.request(
    '/api/v1/auth/firebase-callback',
    { method: 'POST', body: JSON.stringify({ idToken }), headers: { 'Content-Type': 'application/json' } },
    env,
  );
}

describe('POST /api/v1/auth/firebase-callback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects when idToken is missing', async () => {
    const env = await setupEnv();
    const res = await firebaseAuth.request(
      '/api/v1/auth/firebase-callback',
      { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('rejects an invalid token with 401', async () => {
    const env = await setupEnv();
    const res = await postCallback(env, 'not.a.valid.jwt');
    expect(res.status).toBe(401);
  });

  it('creates a new user when no provider/email match exists', async () => {
    const env = await setupEnv();
    const { token } = await mintToken({
      sub: 'fb-new-1',
      email: 'new@example.com',
      emailVerified: true,
      name: 'New User',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-1'] },
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { token: string; is_new_user: boolean };
    expect(body.is_new_user).toBe(true);
    expect(body.token).toBeTruthy();
  });

  it('matches an existing user by Firebase UID (returning user)', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-existing-1"]`]:
        { user_id: 'user-uuid-1' },
      [`SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?::["user-uuid-1"]`]:
        { id: 'user-uuid-1', email: 'x@example.com', name: 'X', profile_public: 1, tier: 'free', created_at: 't', updated_at: 't' },
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({ sub: 'fb-existing-1', signInProvider: 'google.com', identities: { 'google.com': ['gsub-1'] } });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(false);
  });

  it('migrates an existing pre-Firebase Google user via google sub match', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-fresh-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["google","gsub-existing"]`]:
        { user_id: 'user-uuid-2' },
      [`SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?::["user-uuid-2"]`]:
        { id: 'user-uuid-2', email: 'g@example.com', name: 'G', profile_public: 1, tier: 'free', created_at: 't', updated_at: 't' },
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-fresh-1',
      signInProvider: 'google.com',
      identities: { 'google.com': ['gsub-existing'] },
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(false);
  });

  it('auto-links Apple sign-in to an existing user when verified email matches', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-apple-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["apple","apple-sub-x"]`]: null,
      [`SELECT id FROM users WHERE email = ?::["link@example.com"]`]: { id: 'user-uuid-3' },
      [`SELECT id, email, name, picture_url, profile_public, tier, created_at, updated_at FROM users WHERE id = ?::["user-uuid-3"]`]:
        { id: 'user-uuid-3', email: 'link@example.com', name: 'L', profile_public: 1, tier: 'free', created_at: 't', updated_at: 't' },
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-apple-1',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-x'] },
      email: 'link@example.com',
      emailVerified: true,
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(false);
  });

  it('does NOT auto-link when email is not verified', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-unverified-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["apple","apple-sub-y"]`]: null,
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-unverified-1',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-y'] },
      email: 'unverified@example.com',
      emailVerified: false,
      name: 'U',
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(true);
  });

  it('treats Hide-My-Email relay as a new account when no exact email match', async () => {
    const seed = {
      [`SELECT user_id FROM user_auth_providers WHERE provider = 'firebase' AND provider_id = ?::["fb-relay-1"]`]: null,
      [`SELECT user_id FROM user_auth_providers WHERE provider = ? AND provider_id = ?::["apple","apple-sub-relay"]`]: null,
      [`SELECT id FROM users WHERE email = ?::["xyz123@privaterelay.appleid.com"]`]: null,
    };
    const env = await setupEnv(seed);
    const { token } = await mintToken({
      sub: 'fb-relay-1',
      signInProvider: 'apple.com',
      identities: { 'apple.com': ['apple-sub-relay'] },
      email: 'xyz123@privaterelay.appleid.com',
      emailVerified: true,
      name: 'R',
    });

    const res = await postCallback(env, token);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { is_new_user: boolean };
    expect(body.is_new_user).toBe(true);
  });
});
