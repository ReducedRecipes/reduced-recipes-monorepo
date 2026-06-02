import { describe, it, expect, vi } from 'vitest';
import pantry from './pantry';
import type { Env } from '@rr/shared/env';

const TEST_USER = {
  id: 'user-1', email: 't@t', name: 'T', picture_url: null,
  profile_public: 1, tier: 'free' as const,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function makeUsersDB() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(TEST_USER),
    })),
  };
}

function makeKV(initial = new Map<string, string>()) {
  return {
    get: vi.fn(async (k: string) => initial.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => { initial.set(k, v); }),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  const sessionStore = new Map([['session:tok', JSON.stringify({ user_id: 'user-1', created_at: Date.now() })]]);
  return {
    DB: { prepare: vi.fn() },
    USERS_DB: makeUsersDB(),
    USER_CACHE_KV: makeKV(),
    SESSION_KV: makeKV(sessionStore),
    ...overrides,
  } as unknown as Env;
}

function authHeaders() {
  return { Authorization: 'Bearer tok' };
}

describe('GET /api/v1/me/pantry', () => {
  it('returns empty state when nothing stored', async () => {
    const env = createEnv();
    const res = await pantry.request('http://localhost/api/v1/me/pantry', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pantry: { have: [], exclude: [] } });
  });

  it('returns stored pantry', async () => {
    const kv = makeKV(new Map([['pantry:user-1', JSON.stringify({ have: ['beef'], exclude: ['mushrooms'] })]]));
    const env = createEnv({ USER_CACHE_KV: kv });
    const res = await pantry.request('http://localhost/api/v1/me/pantry', { headers: authHeaders() }, env);
    expect(await res.json()).toEqual({ pantry: { have: ['beef'], exclude: ['mushrooms'] } });
  });

  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {}, env);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/v1/me/pantry', () => {
  it('writes normalised pantry to KV', async () => {
    const kv = makeKV();
    const env = createEnv({ USER_CACHE_KV: kv });
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {
      method: 'PUT',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ pantry: { have: [' BEEF ', 'beef', 'potato', ''], exclude: ['Mushrooms'] } }),
    }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pantry: { have: ['beef', 'potato'], exclude: ['mushrooms'] } });
    expect(kv.put).toHaveBeenCalledWith('pantry:user-1', JSON.stringify({ have: ['beef', 'potato'], exclude: ['mushrooms'] }));
  });

  it('returns 400 for invalid body', async () => {
    const env = createEnv();
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {
      method: 'PUT',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ pantry: { have: 'beef' } }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('caps each list at 100 entries', async () => {
    const env = createEnv();
    const long = Array.from({ length: 150 }, (_, i) => `ing-${i}`);
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {
      method: 'PUT',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ pantry: { have: long, exclude: [] } }),
    }, env);
    const body = await res.json() as { pantry: { have: string[] } };
    expect(body.pantry.have.length).toBe(100);
  });
});
