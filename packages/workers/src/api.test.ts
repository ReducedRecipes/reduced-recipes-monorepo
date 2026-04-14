import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from './api';

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
    const tagStmt = makeStmt([{ tag: 'italian' }]);

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
