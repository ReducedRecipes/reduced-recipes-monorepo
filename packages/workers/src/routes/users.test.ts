import { describe, it, expect, vi, beforeEach } from 'vitest';
import users from './users';

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

function makeKV() {
  return {
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
    getWithMetadata: vi.fn().mockResolvedValue({ value: null, metadata: null }),
  };
}

const testUser = {
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  picture_url: 'https://img.com/avatar.jpg',
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

const testSession = JSON.stringify({ user_id: 'user-1', created_at: Date.now() });

function createEnv() {
  const defaultStmt = makeStmt();
  return {
    DB: {
      prepare: vi.fn().mockReturnValue(defaultStmt),
      batch: vi.fn().mockResolvedValue([]),
      exec: vi.fn(),
      dump: vi.fn(),
    },
    RECIPES_KV: makeKV(),
    CACHE_KV: makeKV(),
    IMAGES_R2: {} as unknown,
    CRAWL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PARSE_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PROJECTION_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    ADMIN_TOKEN: 'test-admin-token',
    BOT_USER_AGENT: 'TestBot/1.0',
    DEFAULT_CRAWL_DELAY_MS: '3000',
    USERS_DB: {
      prepare: vi.fn().mockReturnValue(defaultStmt),
      batch: vi.fn().mockResolvedValue([]),
      exec: vi.fn(),
      dump: vi.fn(),
    },
    SESSION_KV: makeKV(),
    USER_CACHE_KV: makeKV(),
    GOOGLE_CLIENT_ID: 'test-client-id',
    GOOGLE_CLIENT_SECRET: 'test-client-secret',
    GOOGLE_REDIRECT_URI: 'https://example.com/callback',
    SESSION_SECRET: 'test-secret',
  };
}

function setupAuth(env: ReturnType<typeof createEnv>) {
  env.SESSION_KV.get = vi.fn().mockImplementation((key: string) => {
    if (key === 'session:valid-token') return Promise.resolve(testSession);
    if (key === 'user-sessions:user-1') return Promise.resolve(JSON.stringify(['valid-token']));
    return Promise.resolve(null);
  });
}

/**
 * Send an authenticated request. Callers should set up env.USERS_DB.prepare
 * BEFORE calling this if they need custom DB behavior.
 */
function authedReq(path: string, env: ReturnType<typeof createEnv>, init: RequestInit = {}) {
  setupAuth(env);

  const headers = new Headers(init.headers);
  headers.set('Authorization', 'Bearer valid-token');

  return users.request(path, { ...init, headers }, env);
}

function unauthReq(path: string, env: ReturnType<typeof createEnv>, init: RequestInit = {}) {
  return users.request(path, init, env);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/users/:id', () => {
  it('returns full public profile', async () => {
    const env = createEnv();
    const userStmt = makeStmt([testUser]);
    env.USERS_DB.prepare = vi.fn().mockReturnValue(userStmt);

    const res = await unauthReq('/api/v1/users/user-1', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { user: typeof testUser };
    expect(body.user.id).toBe('user-1');
    expect(body.user.email).toBe('test@example.com');
  });

  it('returns minimal info for private profile when not owner', async () => {
    const env = createEnv();
    const privateUser = { ...testUser, profile_public: 0 };
    const userStmt = makeStmt([privateUser]);
    env.USERS_DB.prepare = vi.fn().mockReturnValue(userStmt);

    const res = await unauthReq('/api/v1/users/user-1', env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.id).toBe('user-1');
    expect(body.name).toBe('Test User');
    expect(body.email).toBeUndefined();
    expect(body.user).toBeUndefined();
  });

  it('returns 404 for non-existent user', async () => {
    const env = createEnv();
    const emptyStmt = makeStmt([]);
    env.USERS_DB.prepare = vi.fn().mockReturnValue(emptyStmt);

    const res = await unauthReq('/api/v1/users/nonexistent', env);
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/v1/users/me', () => {
  it('updates name and returns updated user', async () => {
    const env = createEnv();
    const updatedUser = { ...testUser, name: 'New Name' };

    let selectCallCount = 0;
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) {
        selectCallCount++;
        return selectCallCount <= 1 ? makeStmt([testUser]) : makeStmt([updatedUser]);
      }
      if (sql.includes('UPDATE users')) return makeStmt();
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me', env, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Name' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user: typeof testUser };
    expect(body.user.name).toBe('New Name');
  });

  it('updates profile_public', async () => {
    const env = createEnv();
    const updatedUser = { ...testUser, profile_public: 0 };

    let selectCallCount = 0;
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) {
        selectCallCount++;
        return selectCallCount <= 1 ? makeStmt([testUser]) : makeStmt([updatedUser]);
      }
      if (sql.includes('UPDATE users')) return makeStmt();
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me', env, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile_public: false }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { user: typeof testUser };
    expect(body.user.profile_public).toBe(0);
  });

  it('returns 400 for empty update', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me', env, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for name too long', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me', env, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x'.repeat(101) }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await unauthReq('/api/v1/users/me', env, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    });
    expect(res.status).toBe(401);
  });
});

describe('DELETE /api/v1/users/me', () => {
  it('deletes account and all sessions', async () => {
    const env = createEnv();
    const deleteStmt = makeStmt();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('DELETE FROM users')) return deleteStmt;
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me', env, { method: 'DELETE' });
    expect(res.status).toBe(200);
    const body = await res.json() as { ok: boolean };
    expect(body.ok).toBe(true);
    expect(deleteStmt.run).toHaveBeenCalled();
  });

  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await unauthReq('/api/v1/users/me', env, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/users/me/export', () => {
  it('exports all user data as JSON', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      return makeStmt(sql.includes('SELECT * FROM users WHERE id') ? [testUser] : []);
    });
    env.USERS_DB.batch = vi.fn().mockResolvedValue([
      makeD1Result([testUser]),           // profile
      makeD1Result([]),                    // auth_providers
      makeD1Result([{ user_id: 'user-1', restriction: 'vegetarian' }]), // dietary
      makeD1Result([]),                    // collections
      makeD1Result([]),                    // bookmarks
      makeD1Result([]),                    // views
      makeD1Result([]),                    // notifications
      makeD1Result([]),                    // consent
    ]);

    const res = await authedReq('/api/v1/users/me/export', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('user-data-export');
    const body = await res.json() as Record<string, unknown>;
    expect(body.exported_at).toBeDefined();
    expect(body.profile).toBeDefined();
    expect(body.dietary_preferences).toHaveLength(1);
  });
});

describe('GET /api/v1/users/me/dietary-preferences', () => {
  it('returns dietary restrictions', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT restriction FROM user_dietary_preferences'))
        return makeStmt([{ restriction: 'vegetarian' }, { restriction: 'gluten-free' }]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me/dietary-preferences', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { restrictions: string[] };
    expect(body.restrictions).toEqual(['vegetarian', 'gluten-free']);
  });

  it('returns empty array when no prefs', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me/dietary-preferences', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { restrictions: string[] };
    expect(body.restrictions).toEqual([]);
  });
});

describe('PUT /api/v1/users/me/dietary-preferences', () => {
  it('sets dietary preferences and returns recipe count', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });
    env.USERS_DB.batch = vi.fn().mockResolvedValue([]);

    // Mock recipes DB for count
    env.DB.prepare = vi.fn().mockReturnValue(makeStmt([{ count: 42 }]));

    const res = await authedReq('/api/v1/users/me/dietary-preferences', env, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restrictions: ['vegetarian', 'gluten-free'] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { restrictions: string[]; matching_recipe_count: number };
    expect(body.restrictions).toEqual(['vegetarian', 'gluten-free']);
    expect(body.matching_recipe_count).toBe(42);
    expect(env.USER_CACHE_KV.delete).toHaveBeenCalledWith('user-dietary:user-1');
  });

  it('rejects invalid restriction names', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me/dietary-preferences', env, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restrictions: ['vegetarian', 'not-a-real-diet'] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain('not-a-real-diet');
  });

  it('rejects non-array restrictions', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/me/dietary-preferences', env, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restrictions: 'vegetarian' }),
    });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/dietary-preferences/recipe-count', () => {
  it('returns recipe count for given restrictions', async () => {
    const env = createEnv();
    env.DB.prepare = vi.fn().mockReturnValue(makeStmt([{ count: 150 }]));

    const res = await unauthReq('/api/v1/dietary-preferences/recipe-count?restrictions=vegetarian,vegan', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(body.count).toBe(150);
  });

  it('returns total count with no restrictions', async () => {
    const env = createEnv();
    env.DB.prepare = vi.fn().mockReturnValue(makeStmt([{ count: 1000 }]));

    const res = await unauthReq('/api/v1/dietary-preferences/recipe-count', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { count: number };
    expect(body.count).toBe(1000);
  });

  it('rejects invalid restriction in query', async () => {
    const env = createEnv();
    const res = await unauthReq('/api/v1/dietary-preferences/recipe-count?restrictions=bad-name', env);
    expect(res.status).toBe(400);
  });
});

// ── Follow / Unfollow Tests ──────────────────────────────────────────────

const targetUser = {
  id: 'user-2',
  email: 'other@example.com',
  name: 'Other User',
  picture_url: 'https://img.com/other.jpg',
  profile_public: 1,
  tier: 'free',
  created_at: '2024-01-01T00:00:00',
  updated_at: '2024-01-01T00:00:00',
};

describe('POST /api/v1/users/:id/follow', () => {
  it('follows a public user and creates notification', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id, profile_public FROM users')) return makeStmt([targetUser]);
      if (sql.includes('SELECT follower_id FROM follows')) return makeStmt([]);
      return makeStmt();
    });
    env.USERS_DB.batch = vi.fn().mockResolvedValue([makeD1Result(), makeD1Result()]);

    const res = await authedReq('/api/v1/users/user-2/follow', env, { method: 'POST' });
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
    expect(env.USERS_DB.batch).toHaveBeenCalled();
  });

  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await unauthReq('/api/v1/users/user-2/follow', env, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('returns 400 when following yourself', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-1/follow', env, { method: 'POST' });
    expect(res.status).toBe(400);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toContain('yourself');
  });

  it('returns 404 if target user does not exist', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id, profile_public FROM users')) return makeStmt([]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/nonexistent/follow', env, { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('returns 403 if target profile is private', async () => {
    const env = createEnv();
    const privateTarget = { ...targetUser, profile_public: 0 };

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id, profile_public FROM users')) return makeStmt([privateTarget]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-2/follow', env, { method: 'POST' });
    expect(res.status).toBe(403);
  });

  it('returns 409 if already following', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id, profile_public FROM users')) return makeStmt([targetUser]);
      if (sql.includes('SELECT follower_id FROM follows')) return makeStmt([{ follower_id: 'user-1' }]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-2/follow', env, { method: 'POST' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /api/v1/users/:id/follow', () => {
  it('unfollows a user', async () => {
    const env = createEnv();
    const deleteStmt = makeStmt();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT follower_id FROM follows')) return makeStmt([{ follower_id: 'user-1' }]);
      if (sql.includes('DELETE FROM follows')) return deleteStmt;
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-2/follow', env, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(deleteStmt.run).toHaveBeenCalled();
  });

  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await unauthReq('/api/v1/users/user-2/follow', env, { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('returns 404 if not following', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT follower_id FROM follows')) return makeStmt([]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-2/follow', env, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

// ── Followers / Following / User Collections Tests ───────────────────────

const followerUser = {
  id: 'user-3',
  name: 'Follower User',
  picture_url: 'https://img.com/follower.jpg',
  followed_at: '2024-06-01T00:00:00',
};

describe('GET /api/v1/users/:id/followers', () => {
  it('returns paginated followers list', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-2' }]);
      if (sql.includes('SELECT u.id, u.name, u.picture_url'))
        return makeStmt([followerUser]);
      return makeStmt();
    });

    const res = await unauthReq('/api/v1/users/user-2/followers', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; name: string }>; next_cursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('user-3');
    expect(body.items[0].name).toBe('Follower User');
    expect(body.next_cursor).toBeNull();
  });

  it('includes is_following when authenticated', async () => {
    const env = createEnv();

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-2' }]);
      if (sql.includes('SELECT u.id, u.name, u.picture_url'))
        return makeStmt([followerUser]);
      if (sql.includes('SELECT following_id FROM follows WHERE follower_id'))
        return makeStmt([{ following_id: 'user-3' }]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-2/followers', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; is_following: boolean }> };
    expect(body.items[0].is_following).toBe(true);
  });

  it('returns 404 for non-existent user', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([]);
      return makeStmt();
    });

    const res = await unauthReq('/api/v1/users/nonexistent/followers', env);
    expect(res.status).toBe(404);
  });

  it('supports cursor pagination', async () => {
    const env = createEnv();
    const twoFollowers = [
      { ...followerUser, id: 'user-3', followed_at: '2024-06-02T00:00:00' },
      { id: 'user-4', name: 'User Four', picture_url: 'https://img.com/4.jpg', followed_at: '2024-06-01T00:00:00' },
    ];

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-2' }]);
      if (sql.includes('SELECT u.id, u.name, u.picture_url'))
        return makeStmt(twoFollowers);
      return makeStmt();
    });

    // Request with limit=1 — should get 2 results (limit+1), meaning next_cursor is set
    const res = await unauthReq('/api/v1/users/user-2/followers?limit=1', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.next_cursor).toBe('2024-06-02T00:00:00');
  });
});

describe('GET /api/v1/users/:id/following', () => {
  it('returns paginated following list', async () => {
    const env = createEnv();
    const followedUser = {
      id: 'user-4',
      name: 'Followed User',
      picture_url: 'https://img.com/followed.jpg',
      followed_at: '2024-06-01T00:00:00',
    };

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-2' }]);
      if (sql.includes('SELECT u.id, u.name, u.picture_url'))
        return makeStmt([followedUser]);
      return makeStmt();
    });

    const res = await unauthReq('/api/v1/users/user-2/following', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; name: string }>; next_cursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe('user-4');
    expect(body.next_cursor).toBeNull();
  });

  it('includes is_following when authenticated', async () => {
    const env = createEnv();
    const followedUser = {
      id: 'user-4',
      name: 'Followed User',
      picture_url: 'https://img.com/followed.jpg',
      followed_at: '2024-06-01T00:00:00',
    };

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-2' }]);
      if (sql.includes('SELECT u.id, u.name, u.picture_url'))
        return makeStmt([followedUser]);
      if (sql.includes('SELECT following_id FROM follows WHERE follower_id'))
        return makeStmt([]);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-2/following', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; is_following: boolean }> };
    expect(body.items[0].is_following).toBe(false);
  });

  it('returns 404 for non-existent user', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([]);
      return makeStmt();
    });

    const res = await unauthReq('/api/v1/users/nonexistent/following', env);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/users/:id/collections', () => {
  it('returns public collections for another user', async () => {
    const env = createEnv();
    const publicCollection = {
      id: 'col-1',
      user_id: 'user-2',
      name: 'Favorites',
      is_default: 0,
      is_public: 1,
      position: 0,
      created_at: '2024-01-01T00:00:00',
      updated_at: '2024-01-01T00:00:00',
    };

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-2' }]);
      if (sql.includes('SELECT id, user_id, name') && sql.includes('is_public = 1'))
        return makeStmt([publicCollection]);
      if (sql.includes('SELECT id, user_id, name'))
        return makeStmt([publicCollection]);
      return makeStmt();
    });

    const res = await unauthReq('/api/v1/users/user-2/collections', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ id: string; name: string; is_public: number }> };
    expect(body.items).toHaveLength(1);
    expect(body.items[0].name).toBe('Favorites');
  });

  it('returns all collections when viewing own profile', async () => {
    const env = createEnv();
    const collections = [
      { id: 'col-1', user_id: 'user-1', name: 'Saved', is_default: 1, is_public: 0, position: 0, created_at: '2024-01-01', updated_at: '2024-01-01' },
      { id: 'col-2', user_id: 'user-1', name: 'Public Favs', is_default: 0, is_public: 1, position: 1, created_at: '2024-01-01', updated_at: '2024-01-01' },
    ];

    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT * FROM users WHERE id')) return makeStmt([testUser]);
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([{ id: 'user-1' }]);
      if (sql.includes('SELECT id, user_id, name') && !sql.includes('is_public = 1'))
        return makeStmt(collections);
      if (sql.includes('SELECT id, user_id, name'))
        return makeStmt(collections);
      return makeStmt();
    });

    const res = await authedReq('/api/v1/users/user-1/collections', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[] };
    expect(body.items).toHaveLength(2);
  });

  it('returns 404 for non-existent user', async () => {
    const env = createEnv();
    env.USERS_DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT id FROM users WHERE id')) return makeStmt([]);
      return makeStmt();
    });

    const res = await unauthReq('/api/v1/users/nonexistent/collections', env);
    expect(res.status).toBe(404);
  });
});
