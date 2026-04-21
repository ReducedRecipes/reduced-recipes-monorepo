import { describe, it, expect, vi, afterEach } from 'vitest';
import hotRefresh from './hot-refresh';

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    },
    RECIPES_KV: {},
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
    HOT_DECAY_SECONDS: '90000',
    HOT_EPOCH: '1704067200',
    ...overrides,
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Hot Refresh Worker', () => {
  it('updates hot_score for recipes with vote_count > 0 on schedule', async () => {
    const env = createEnv();
    const runMock = vi.fn().mockResolvedValue({});
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    env.DB.prepare.mockReturnValue({ bind: bindMock });

    await hotRefresh.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(env.DB.prepare).toHaveBeenCalledOnce();
    const sql: string = env.DB.prepare.mock.calls[0]![0];
    expect(sql).toContain('UPDATE recipes');
    expect(sql).toContain('hot_score');
    expect(sql).toContain('LOG10');
    expect(sql).toContain('vote_count > 0');

    expect(bindMock).toHaveBeenCalledWith(1704067200, 90000);
    expect(runMock).toHaveBeenCalledOnce();
  });

  it('uses custom HOT_EPOCH and HOT_DECAY_SECONDS from env', async () => {
    const env = createEnv({ HOT_EPOCH: '1000000', HOT_DECAY_SECONDS: '45000' });
    const runMock = vi.fn().mockResolvedValue({});
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    env.DB.prepare.mockReturnValue({ bind: bindMock });

    await hotRefresh.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(bindMock).toHaveBeenCalledWith(1000000, 45000);
  });

  it('falls back to default EPOCH and DECAY_SECONDS when env vars are absent', async () => {
    const env = createEnv({ HOT_EPOCH: undefined, HOT_DECAY_SECONDS: undefined });
    const runMock = vi.fn().mockResolvedValue({});
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    env.DB.prepare.mockReturnValue({ bind: bindMock });

    await hotRefresh.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(bindMock).toHaveBeenCalledWith(1704067200, 90000);
  });

  it('returns 200 OK when /trigger is requested', async () => {
    const env = createEnv();
    const runMock = vi.fn().mockResolvedValue({});
    const bindMock = vi.fn().mockReturnValue({ run: runMock });
    env.DB.prepare.mockReturnValue({ bind: bindMock });

    const request = new Request('http://localhost/trigger');
    const response = await hotRefresh.fetch(request, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('OK');
    expect(runMock).toHaveBeenCalledOnce();
  });

  it('returns 404 for unknown paths', async () => {
    const env = createEnv();

    const request = new Request('http://localhost/unknown');
    const response = await hotRefresh.fetch(request, env);

    expect(response.status).toBe(404);
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });

  it('returns 500 when DB update throws', async () => {
    const env = createEnv();
    env.DB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('DB error')),
      }),
    });

    const request = new Request('http://localhost/trigger');
    const response = await hotRefresh.fetch(request, env);

    expect(response.status).toBe(500);
    expect(await response.text()).toContain('DB error');
  });
});
