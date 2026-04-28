import { describe, it, expect, vi, afterEach } from 'vitest';
import orchestrator from './orchestrator';

vi.mock('@rr/shared/sitemap', () => ({
  parseSitemap: vi.fn(),
  isRecipeUrl: vi.fn(),
}));

vi.mock('@rr/shared/utils', () => ({
  chunk: vi.fn((arr: unknown[], size: number) => {
    const result: unknown[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }),
  chunks: vi.fn((arr: unknown[], size: number) => {
    const result: unknown[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }),
}));

function createEnv() {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({}),
      }),
      batch: vi.fn(async () => []),
    },
    CRAWL_QUEUE: {
      sendBatch: vi.fn(async () => {}),
    },
    RECIPES_KV: {},
    CACHE_KV: {},
    IMAGES_R2: {},
    PARSE_QUEUE: {},
    PROJECTION_QUEUE: {},
    ADMIN_TOKEN: 'test',
    BOT_USER_AGENT: 'test',
    DEFAULT_CRAWL_DELAY_MS: '2000',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Orchestrator Worker', () => {
  it('does nothing when no pending URLs', async () => {
    const env = createEnv();
    // Default mock returns empty results for the pending URL query
    await orchestrator.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(env.CRAWL_QUEUE.sendBatch).not.toHaveBeenCalled();
  });

  it('enqueues pending URLs to crawl queue', async () => {
    const env = createEnv();
    const dueUrls = [
      { url: 'https://example.com/recipe/1', domain: 'example.com' },
      { url: 'https://example.com/recipe/2', domain: 'example.com' },
    ];

    let callCount = 0;
    env.DB.prepare.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First prepare: SELECT pending URLs from crawl_queue
        return {
          all: vi.fn().mockResolvedValue({ results: dueUrls }),
        };
      }
      // Subsequent: UPDATE crawl_queue SET status + reset stuck
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
        run: vi.fn().mockResolvedValue({}),
      };
    });

    await orchestrator.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(env.CRAWL_QUEUE.sendBatch).toHaveBeenCalledOnce();
    const sentBatch = env.CRAWL_QUEUE.sendBatch.mock.calls[0]![0] as any[];
    expect(sentBatch).toHaveLength(2);
    expect(sentBatch[0]!.body).toEqual(dueUrls[0]);
  });

  it('returns 200 OK when /trigger is requested', async () => {
    const env = createEnv();
    const request = new Request('http://localhost/trigger');
    const response = await orchestrator.fetch(request, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('OK');
  });

  it('returns 404 for unknown paths', async () => {
    const env = createEnv();
    const request = new Request('http://localhost/unknown');
    const response = await orchestrator.fetch(request, env);

    expect(response.status).toBe(404);
  });
});
