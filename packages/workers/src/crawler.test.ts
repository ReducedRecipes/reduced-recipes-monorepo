import { describe, it, expect, vi, afterEach } from 'vitest';
import crawler from './crawler';

vi.mock('@rr/shared/robots', () => ({
  checkRobots: vi.fn(),
}));

import { checkRobots } from '@rr/shared/robots';

function createMessage(body: { url: string; domain: string }, id = 'msg-1') {
  return {
    id,
    body,
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createBatch(messages: ReturnType<typeof createMessage>[]) {
  return {
    queue: 'crawl-jobs',
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<{ url: string; domain: string }>;
}

function createEnv() {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
          first: vi.fn().mockResolvedValue(null),
        }),
      }),
    },
    RECIPES_KV: {},
    CACHE_KV: {
      get: vi.fn(async () => null),
      put: vi.fn(async () => {}),
    },
    IMAGES_R2: {},
    CRAWL_QUEUE: {},
    PARSE_QUEUE: {
      send: vi.fn(async () => {}),
    },
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
  vi.unstubAllGlobals();
});

describe('Crawler Worker', () => {
  it('skips URL when robots.txt disallows', async () => {
    (checkRobots as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    const msg = createMessage({ url: 'https://example.com/recipe/1', domain: 'example.com' });
    const batch = createBatch([msg]);
    const env = createEnv();

    await crawler.queue(batch, env);

    expect(msg.ack).toHaveBeenCalledOnce();
    // Should update status to skipped
    expect(env.DB.prepare).toHaveBeenCalledWith(
      "UPDATE crawl_queue SET status = ?, last_crawled = datetime('now') WHERE url = ?",
    );
  });

  it('retries when rate limited', async () => {
    (checkRobots as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const msg = createMessage({ url: 'https://example.com/recipe/1', domain: 'example.com' });
    const batch = createBatch([msg]);
    const env = createEnv();
    // Simulate rate limit: KV key already exists
    env.CACHE_KV.get.mockResolvedValue('1');
    // Domain config query
    env.DB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        first: vi.fn().mockResolvedValue({ crawl_delay_ms: 3000 }),
        run: vi.fn().mockResolvedValue({}),
      }),
    });

    await crawler.queue(batch, env);

    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('fetches HTML and enqueues parse job on success', async () => {
    (checkRobots as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const msg = createMessage({ url: 'https://example.com/recipe/1', domain: 'example.com' });
    const batch = createBatch([msg]);
    const env = createEnv();

    const html = '<html><body>Recipe page</body></html>';
    const buffer = new TextEncoder().encode(html).buffer;
    const mockResponse = {
      ok: true,
      headers: { get: vi.fn((key: string) => key === 'content-type' ? 'text/html; charset=utf-8' : null) },
      arrayBuffer: vi.fn(async () => buffer),
    };
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse));

    await crawler.queue(batch, env);

    expect(env.PARSE_QUEUE.send).toHaveBeenCalledOnce();
    expect(msg.ack).toHaveBeenCalledOnce();
  });
});
