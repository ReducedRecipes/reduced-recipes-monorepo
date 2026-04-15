import { describe, it, expect, vi } from 'vitest';
import dlq from './dlq';

function createMessage(body: unknown, id = 'msg-1') {
  return {
    id,
    body,
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createBatch(queue: string, messages: ReturnType<typeof createMessage>[]) {
  return {
    queue,
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<unknown>;
}

function createEnv() {
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
  } as any;
}

describe('DLQ Worker', () => {
  it('acks all messages regardless of queue', async () => {
    const msg1 = createMessage({ some: 'data' }, 'msg-1');
    const msg2 = createMessage({ other: 'data' }, 'msg-2');
    const batch = createBatch('parse-dlq', [msg1, msg2]);
    const env = createEnv();

    await dlq.queue(batch, env);

    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.ack).toHaveBeenCalledOnce();
  });

  it('updates crawl_queue status for crawl-dlq messages with url', async () => {
    const msg = createMessage({ url: 'https://example.com/recipe' });
    const batch = createBatch('crawl-dlq', [msg]);
    const env = createEnv();

    await dlq.queue(batch, env);

    expect(env.DB.prepare).toHaveBeenCalledWith(
      'UPDATE crawl_queue SET status = ? WHERE url = ?',
    );
    const bindMock = env.DB.prepare.mock.results[0].value.bind;
    expect(bindMock).toHaveBeenCalledWith('failed', 'https://example.com/recipe');
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('does not update DB for crawl-dlq messages without url', async () => {
    const msg = createMessage({ domain: 'example.com' });
    const batch = createBatch('crawl-dlq', [msg]);
    const env = createEnv();

    await dlq.queue(batch, env);

    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('does not update DB for non-crawl-dlq queues', async () => {
    const msg = createMessage({ url: 'https://example.com/recipe' });
    const batch = createBatch('projection-dlq', [msg]);
    const env = createEnv();

    await dlq.queue(batch, env);

    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('still acks message even if DB update fails', async () => {
    const msg = createMessage({ url: 'https://example.com/recipe' });
    const batch = createBatch('crawl-dlq', [msg]);
    const env = createEnv();
    env.DB.prepare.mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockRejectedValue(new Error('D1 error')),
      }),
    });

    await dlq.queue(batch, env);

    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('logs structured error for each message', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const msg = createMessage({ url: 'https://example.com' }, 'test-id');
    const batch = createBatch('parse-dlq', [msg]);
    const env = createEnv();

    await dlq.queue(batch, env);

    expect(consoleSpy).toHaveBeenCalledOnce();
    const firstCall = consoleSpy.mock.calls[0];
    if (!firstCall) throw new Error('Expected console.error to have been called');
    const logged = JSON.parse(firstCall[0] as string);
    expect(logged).toMatchObject({
      level: 'error',
      queue: 'parse-dlq',
      messageId: 'test-id',
      body: { url: 'https://example.com' },
    });
    expect(logged.timestamp).toBeDefined();

    consoleSpy.mockRestore();
  });
});
