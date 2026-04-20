import { describe, it, expect, vi, beforeEach } from 'vitest';
import hotRanking from './hot-ranking';

vi.mock('@rr/shared/utils', () => ({
  chunks: vi.fn((arr: unknown[], size: number) => {
    const result: unknown[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }),
}));

function createMockDB() {
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockRun = vi.fn().mockResolvedValue({});
  const mockBind = vi.fn().mockReturnValue({
    all: mockAll,
    run: mockRun,
  });
  return {
    prepare: vi.fn().mockReturnValue({
      bind: mockBind,
      all: mockAll,
      run: mockRun,
    }),
    batch: vi.fn(async () => []),
    _mockAll: mockAll,
    _mockRun: mockRun,
  };
}

function createEnv() {
  const db = createMockDB();
  const usersDb = createMockDB();
  return {
    DB: db,
    USERS_DB: usersDb,
    RECIPES_KV: {
      put: vi.fn(async () => {}),
      get: vi.fn(async () => null),
    },
    CACHE_KV: {},
    IMAGES_R2: {},
    CRAWL_QUEUE: {},
    PARSE_QUEUE: {},
    PROJECTION_QUEUE: {},
    ADMIN_TOKEN: 'test',
    BOT_USER_AGENT: 'test',
    DEFAULT_CRAWL_DELAY_MS: '2000',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    WEIGHT_VIEW: '1.0',
    WEIGHT_BOOKMARK: '3.0',
    HOT_DECAY_SECONDS: '90000',
    HOT_EPOCH: '1704067200',
  } as any;
}

describe('Hot Ranking Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });

  it('does nothing when no engagement data exists', async () => {
    const env = createEnv();
    await hotRanking.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // Should query USERS_DB for views and bookmarks
    expect(env.USERS_DB.prepare).toHaveBeenCalledTimes(2);
    // Should NOT update recipes or KV when no engagement
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(env.RECIPES_KV.put).not.toHaveBeenCalled();
  });

  it('computes hot scores and updates DB and KV', async () => {
    const env = createEnv();
    const now = Date.now();
    const extractedAt = new Date(now - 24 * 60 * 60 * 1000).toISOString(); // 24h ago

    // Mock USERS_DB: views query returns 1 recipe with 10 views
    let callCount = 0;
    env.USERS_DB.prepare = vi.fn().mockImplementation(() => ({
      bind: vi.fn().mockImplementation(() => ({
        all: vi.fn().mockImplementation(async () => {
          callCount++;
          if (callCount === 1) {
            // views query
            return { results: [{ recipe_id: 'recipe-1', cnt: 10 }] };
          }
          // bookmarks query
          return { results: [{ recipe_id: 'recipe-1', cnt: 2 }] };
        }),
      })),
    }));

    // Mock DB: recipe age query and top 100 query
    const mockAllForSql = (sql: string) => vi.fn().mockImplementation(async () => {
      if (sql.includes('SELECT id, extracted_at')) {
        return { results: [{ id: 'recipe-1', extracted_at: extractedAt }] };
      }
      if (sql.includes('SELECT id, title')) {
        return {
          results: [{
            id: 'recipe-1',
            title: 'Test Recipe',
            image_url: null,
            domain: 'example.com',
            cuisine: 'Italian',
            total_time: 30,
            hot_score: 1.23,
          }],
        };
      }
      return { results: [] };
    });
    env.DB.prepare = vi.fn().mockImplementation((sql: string) => {
      const allFn = mockAllForSql(sql);
      return {
        bind: vi.fn().mockImplementation(() => ({
          all: allFn,
          run: vi.fn().mockResolvedValue({}),
        })),
        all: allFn,
        run: vi.fn().mockResolvedValue({}),
      };
    });
    env.DB.batch = vi.fn(async () => []);

    await hotRanking.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    // Should batch-update scores
    expect(env.DB.batch).toHaveBeenCalled();
    // Should write to KV
    expect(env.RECIPES_KV.put).toHaveBeenCalled();
    const [key, value] = (env.RECIPES_KV.put as any).mock.calls[0];
    expect(key).toBe('hot:top100');
    const parsed = JSON.parse(value);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.updated_at).toBeDefined();
  });

  it('responds to /trigger HTTP endpoint', async () => {
    const env = createEnv();
    const request = new Request('http://localhost/trigger');
    const response = await hotRanking.fetch(request, env);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('OK');
  });

  it('returns 404 for unknown paths', async () => {
    const env = createEnv();
    const request = new Request('http://localhost/unknown');
    const response = await hotRanking.fetch(request, env);
    expect(response.status).toBe(404);
  });
});
