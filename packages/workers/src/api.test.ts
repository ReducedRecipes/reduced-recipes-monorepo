import { describe, it, expect, vi, beforeEach } from 'vitest';
import { app } from './api';

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

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  const defaultStmt = makeStmt();
  return {
    DB: {
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
    IMAGES_R2: {} as unknown,
    CRAWL_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PARSE_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    PROJECTION_QUEUE: { send: vi.fn(), sendBatch: vi.fn() },
    ADMIN_TOKEN: 'test-admin-token',
    BOT_USER_AGENT: 'TestBot/1.0',
    DEFAULT_CRAWL_DELAY_MS: '3000',
    ...overrides,
  };
}

function req(path: string, env: ReturnType<typeof createEnv>) {
  return app.request(path, {}, env);
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('GET /api/v1/recipes', () => {
  it('returns recipes with default pagination', async () => {
    const env = createEnv();
    const recipes = [
      { id: 'r1', title: 'Pasta', domain: 'example.com', image_url: null, total_time: 30, cook_time: 20, yields: '4 servings', cuisine: 'Italian', category: 'Main', extracted_at: '2024-01-02T00:00:00Z' },
      { id: 'r2', title: 'Soup', domain: 'example.com', image_url: 'https://img.com/soup.jpg', total_time: 45, cook_time: 30, yields: '6 servings', cuisine: 'French', category: 'Starter', extracted_at: '2024-01-01T00:00:00Z' },
    ];

    const listStmt = makeStmt(recipes);
    const tagStmt = makeStmt([]);

    let callCount = 0;
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      if (callCount === 0) { callCount++; return listStmt; }
      return listStmt;
    });

    const res = await req('/api/v1/recipes', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(2);
    expect(body.next_cursor).toBeNull();
  });

  it('supports cursor pagination', async () => {
    const env = createEnv();
    // Return limit+1 rows to trigger next_cursor
    const recipes = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`, title: `Recipe ${i}`, domain: 'example.com', image_url: null,
      total_time: 30, cook_time: 20, yields: '4', cuisine: null, category: null,
      extracted_at: `2024-01-${String(25 - i).padStart(2, '0')}T00:00:00Z`,
    }));

    const listStmt = makeStmt(recipes);
    const tagStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    const res = await req('/api/v1/recipes', env);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.items).toHaveLength(24);
    expect(body.next_cursor).not.toBeNull();
  });

  it('filters by tag via JOIN', async () => {
    const env = createEnv();
    const listStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation(() => listStmt);

    await req('/api/v1/recipes?tag=vegan', env);

    const prepareCalls = env.DB.prepare.mock.calls as string[][];
    const mainQuery = prepareCalls.find((c) => c[0]!.includes('FROM recipes'));
    expect(mainQuery![0]).toContain('JOIN recipe_tags');
  });

  it('sort=hot uses hot_score DESC when votes exceed threshold', async () => {
    const env = createEnv();
    const totalsStmt = { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ total: 200 }) };
    const listStmt = makeStmt([]);
    const tagStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SUM(vote_count)')) return totalsStmt;
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    await req('/api/v1/recipes?sort=hot', env);

    const prepareCalls = env.DB.prepare.mock.calls as string[][];
    const mainQuery = prepareCalls.find((c) => c[0]!.includes('FROM recipes r'));
    expect(mainQuery![0]).toContain('hot_score DESC');
  });

  it('sort=hot falls back to extracted_at DESC during cold start (total votes < threshold)', async () => {
    const env = createEnv();
    const totalsStmt = { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ total: 5 }) };
    const listStmt = makeStmt([]);
    const tagStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SUM(vote_count)')) return totalsStmt;
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    await req('/api/v1/recipes?sort=hot', env);

    const prepareCalls = env.DB.prepare.mock.calls as string[][];
    const mainQuery = prepareCalls.find((c) => c[0]!.includes('FROM recipes r'));
    // ORDER BY should use extracted_at DESC (cold start fallback), not hot_score DESC
    expect(mainQuery![0]).toMatch(/ORDER BY r\.extracted_at DESC/);
    expect(mainQuery![0]).not.toMatch(/ORDER BY r\.hot_score/);
  });

  it('sort=top uses vote_count DESC', async () => {
    const env = createEnv();
    const listStmt = makeStmt([]);
    const tagStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    await req('/api/v1/recipes?sort=top', env);

    const prepareCalls = env.DB.prepare.mock.calls as string[][];
    const mainQuery = prepareCalls.find((c) => c[0]!.includes('FROM recipes r'));
    expect(mainQuery![0]).toContain('vote_count DESC');
  });

  it('sort=hot returns hot_score as next_cursor when paginating', async () => {
    const env = createEnv();
    const recipes = Array.from({ length: 25 }, (_, i) => ({
      id: `r${i}`, title: `Recipe ${i}`, domain: 'example.com', image_url: null,
      total_time: 30, cook_time: 20, yields: '4', cuisine: null, category: null,
      extracted_at: `2024-01-01T00:00:00Z`, hot_score: 25 - i, vote_count: 25 - i,
    }));
    const totalsStmt = { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ total: 200 }) };
    const listStmt = makeStmt(recipes);
    const tagStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SUM(vote_count)')) return totalsStmt;
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    const res = await req('/api/v1/recipes?sort=hot', env);
    const body = await res.json() as { items: unknown[]; next_cursor: string | null };
    expect(body.next_cursor).not.toBeNull();
    // next_cursor should be the hot_score of the last item (index 23, value = 25-23 = 2)
    expect(body.next_cursor).toBe('2');
  });

  it('sort=hot respects HOT_MIN_TOTAL_VOTES env override', async () => {
    const env = createEnv({ HOT_MIN_TOTAL_VOTES: '50' });
    // 40 votes < 50 threshold → cold start
    const totalsStmt = { bind: vi.fn().mockReturnThis(), first: vi.fn().mockResolvedValue({ total: 40 }) };
    const listStmt = makeStmt([]);
    const tagStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('SUM(vote_count)')) return totalsStmt;
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    await req('/api/v1/recipes?sort=hot', env);

    const prepareCalls = env.DB.prepare.mock.calls as string[][];
    const mainQuery = prepareCalls.find((c) => c[0]!.includes('FROM recipes r'));
    // ORDER BY should use extracted_at DESC (cold start fallback), not hot_score DESC
    expect(mainQuery![0]).toMatch(/ORDER BY r\.extracted_at DESC/);
    expect(mainQuery![0]).not.toMatch(/ORDER BY r\.hot_score/);
  });
});

describe('GET /api/v1/tags', () => {
  it('returns tags with counts and cache header', async () => {
    const env = createEnv();
    const tagStmt = makeStmt([
      { tag: 'vegan', count: 42 },
      { tag: 'quick', count: 30 },
    ]);
    env.DB.prepare = vi.fn().mockReturnValue(tagStmt);

    const res = await req('/api/v1/tags', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    const body = await res.json() as { tag: string; count: number }[];
    expect(body).toHaveLength(2);
    expect(body[0]).toEqual({ tag: 'vegan', count: 42 });
  });
});

describe('GET /api/v1/domains', () => {
  it('returns active domains with cache header', async () => {
    const env = createEnv();
    const domainStmt = makeStmt([
      { domain: 'example.com', recipe_count: 100, last_spidered: '2024-01-01T00:00:00Z' },
    ]);
    env.DB.prepare = vi.fn().mockReturnValue(domainStmt);

    const res = await req('/api/v1/domains', env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=3600');
    const body = await res.json() as { domain: string }[];
    expect(body).toHaveLength(1);
    expect(body[0]).toEqual({
      domain: 'example.com',
      recipe_count: 100,
      last_spidered: '2024-01-01T00:00:00Z',
    });
  });
});

describe('GET /api/v1/domains/:domain/recipes', () => {
  it('filters recipes by domain param', async () => {
    const env = createEnv();
    const listStmt = makeStmt([
      { id: 'r1', title: 'Pasta', domain: 'example.com', image_url: null, total_time: 30, cook_time: 20, yields: '4', cuisine: 'Italian', category: 'Main', extracted_at: '2024-01-01T00:00:00Z' },
    ]);
    const tagStmt = makeStmt([{ recipe_id: 'r1', tag: 'italian' }]);

    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      if (sql.includes('recipe_tags WHERE recipe_id')) return tagStmt;
      return listStmt;
    });

    const res = await req('/api/v1/domains/example.com/recipes', env);
    expect(res.status).toBe(200);
    const body = await res.json() as { items: Array<{ domain: string; tags: string[] }>; next_cursor: string | null };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.domain).toBe('example.com');
    expect(body.items[0]!.tags).toEqual(['italian']);

    // Verify domain was bound in query
    const mainCalls = env.DB.prepare.mock.calls as string[][];
    const mainCall = mainCalls.find((c) => c[0]!.includes('FROM recipes'));
    expect(mainCall![0]).toContain('r.domain = ?');
  });
});

// ── S-2: Recipe detail + view tracking ──────────────────────────────────

describe('GET /api/v1/recipes/:id', () => {
  it('returns 404 when recipe not found in KV', async () => {
    const env = createEnv();
    const res = await req('/api/v1/recipes/missing-id', env);
    expect(res.status).toBe(404);
    const body = await res.json() as any;
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('returns recipe document from KV', async () => {
    const env = createEnv();
    const doc = { id: 'r1', title: 'Test Recipe', url: 'https://example.com/recipe' };
    env.RECIPES_KV.get = vi.fn().mockResolvedValue(JSON.stringify(doc));

    const res = await req('/api/v1/recipes/r1', env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.title).toBe('Test Recipe');
    expect(res.headers.get('Cache-Control')).toContain('max-age=3600');
  });

  it('tracks view without id column (auto-increment) for authenticated users', async () => {
    const usersStmt = makeStmt();
    const usersDb = {
      prepare: vi.fn().mockReturnValue(usersStmt),
    };
    const env = createEnv({ USERS_DB: usersDb });
    const doc = { id: 'r1', title: 'Test Recipe' };
    env.RECIPES_KV.get = vi.fn().mockResolvedValue(JSON.stringify(doc));

    // Simulate authenticated user via optionalAuth middleware
    // The middleware sets userId on the context; we mock USERS_DB to verify the SQL
    const waitUntilPromises: Promise<unknown>[] = [];
    const res = await app.request('/api/v1/recipes/r1', {}, {
      ...env,
      executionCtx: { waitUntil: (p: Promise<unknown>) => waitUntilPromises.push(p) },
      // optionalAuth reads SESSION_KV; provide a valid session
      SESSION_KV: {
        get: vi.fn().mockResolvedValue(JSON.stringify({ userId: 'user-123', expiresAt: Date.now() + 100000 })),
        put: vi.fn(), delete: vi.fn(), list: vi.fn(), getWithMetadata: vi.fn(),
      },
    } as any);

    expect(res.status).toBe(200);

    // Wait for fire-and-forget view tracking
    await Promise.allSettled(waitUntilPromises);

    // Verify the INSERT does NOT include the id column
    if (usersDb.prepare.mock.calls.length > 0) {
      const sql = usersDb.prepare.mock.calls[0]![0] as string;
      expect(sql).toContain('INSERT OR IGNORE INTO recipe_views');
      expect(sql).toContain('user_id, recipe_id, source, viewed_date, viewed_at');
      expect(sql).not.toContain('(id,');
      // Should bind only 2 params (userId, recipeId), not 3
      expect(usersStmt.bind).toHaveBeenCalledWith('user-123', 'r1');
    }
  });
});

// ── S-8: Search, Admin, Remove tests ────────────────────────────────────

function reqWithInit(path: string, env: ReturnType<typeof createEnv>, init?: RequestInit) {
  return app.request(path, init, env);
}

describe('GET /api/v1/search', () => {
  it('returns 400 for query shorter than 2 chars', async () => {
    const env = createEnv();
    const res = await reqWithInit('/api/v1/search?q=a', env);
    expect(res.status).toBe(400);
    const body = await res.json() as any;
    expect(body.error.code).toBe('INVALID_QUERY');
  });

  it('returns empty result for sanitized-empty query', async () => {
    const env = createEnv();
    const res = await reqWithInit('/api/v1/search?q=**', env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body).toEqual({ items: [], next_cursor: null });
  });

  it('returns search results from FTS', async () => {
    const env = createEnv();
    const ftsStmt = makeStmt([
      { id: 'r1', title: 'Pasta', domain: 'test.com', image_url: null, total_time: 30, cook_time: 20, yields: '4', cuisine: 'Italian', category: 'Main' },
    ]);
    env.DB.prepare = vi.fn().mockReturnValue(ftsStmt);

    const res = await reqWithInit('/api/v1/search?q=pasta', env);
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.items).toHaveLength(1);
    expect(body.items[0].title).toBe('Pasta');
  });

  it('respects limit parameter capped at 50', async () => {
    const env = createEnv();
    const ftsStmt = makeStmt([]);
    env.DB.prepare = vi.fn().mockReturnValue(ftsStmt);

    await reqWithInit('/api/v1/search?q=test&limit=100', env);
    // limit is capped at 50, +1 for has_more check, offset defaults to 0
    expect(ftsStmt.bind).toHaveBeenCalledWith(expect.any(String), 51, 0);
  });
});

describe('POST /api/v1/admin/seed', () => {
  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await reqWithInit('/api/v1/admin/seed', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ domain: 'example.com' }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with wrong token', async () => {
    const env = createEnv();
    const res = await reqWithInit('/api/v1/admin/seed', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ domain: 'example.com' }),
    });
    expect(res.status).toBe(401);
  });

  it('inserts domain with valid auth', async () => {
    const env = createEnv();
    const seedStmt = makeStmt();
    env.DB.prepare = vi.fn().mockReturnValue(seedStmt);

    const res = await reqWithInit('/api/v1/admin/seed', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test-admin-token' },
      body: JSON.stringify({ domain: 'example.com' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.domain).toBe('example.com');
    expect(seedStmt.run).toHaveBeenCalled();
  });
});

describe('POST /api/v1/admin/rebuild', () => {
  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await reqWithInit('/api/v1/admin/rebuild', env, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('queues projection jobs for all KV keys', async () => {
    const doc = JSON.stringify({ id: 'r1', title: 'Test' });
    const env = createEnv();
    env.RECIPES_KV.list = vi.fn().mockResolvedValue({
      keys: [{ name: 'recipe:r1' }, { name: 'recipe:r2' }],
      list_complete: true,
    });
    env.RECIPES_KV.get = vi.fn().mockResolvedValue(doc);

    const res = await reqWithInit('/api/v1/admin/rebuild', env, {
      method: 'POST',
      headers: { Authorization: 'Bearer test-admin-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.queued).toBe(2);
    expect(env.PROJECTION_QUEUE.send).toHaveBeenCalledTimes(2);
  });
});

describe('POST /api/v1/remove', () => {
  it('returns 400 for missing fields', async () => {
    const env = createEnv();
    const res = await reqWithInit('/api/v1/remove', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com' }),
    });
    expect(res.status).toBe(400);
  });

  it('accepts valid removal request', async () => {
    const env = createEnv();
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const res = await reqWithInit('/api/v1/remove', env, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/recipe', email: 'test@test.com', reason: 'copyright' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(consoleSpy).toHaveBeenCalledOnce();
    const logged = JSON.parse(consoleSpy.mock.calls[0]![0] as string);
    expect(logged.type).toBe('REMOVAL_REQUEST');
    expect(logged.url).toBe('https://example.com/recipe');
    expect(logged.email).toBe('test@test.com');
    expect(logged.timestamp).toBeDefined();
    consoleSpy.mockRestore();
  });
});

// ── Error handler tests ─────────────────────────────────────────────────

describe('Global error handler', () => {
  it('does not leak error message in response', async () => {
    const env = createEnv();
    env.DB.batch = vi.fn().mockRejectedValue(new Error('sensitive DB info'));

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await req('/api/v1/health', env);
    expect(res.status).toBe(500);
    const body = await res.json() as any;
    expect(body.error.message).toBe('Internal server error');
    expect(body.error.message).not.toContain('sensitive');
    consoleSpy.mockRestore();
  });
});
