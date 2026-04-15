import { describe, it, expect, vi } from 'vitest';
import parser from './parser';
import type { ParseJob } from '@rr/shared';

const VALID_HTML = `
<html><body>
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Test Pasta",
  "recipeIngredient": ["pasta", "sauce"],
  "recipeInstructions": [{"@type": "HowToStep", "text": "Boil pasta"}],
  "image": "https://example.com/img.jpg",
  "totalTime": "PT30M"
}
</script>
<a href="/recipe/other">Other</a>
<a href="/recipe/another">Another</a>
<a href="https://external.com/nope">External</a>
</body></html>`;

const NO_SCHEMA_HTML = `<html><body><p>No recipe here</p></body></html>`;

const EMPTY_TITLE_HTML = `
<html><body>
<script type="application/ld+json">
{"@type": "Recipe", "name": "", "recipeIngredient": ["flour"]}
</script>
</body></html>`;

const NO_INGREDIENTS_HTML = `
<html><body>
<script type="application/ld+json">
{"@type": "Recipe", "name": "Empty Recipe", "recipeIngredient": []}
</script>
</body></html>`;

function createMessage(body: ParseJob, id = 'msg-1') {
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
    queue: 'parse-jobs',
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<ParseJob>;
}

function createEnv() {
  const prepareFn = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({}),
    }),
  });
  return {
    DB: { prepare: prepareFn },
    RECIPES_KV: {
      put: vi.fn().mockResolvedValue(undefined),
    },
    CACHE_KV: {},
    IMAGES_R2: {},
    CRAWL_QUEUE: {},
    PARSE_QUEUE: {},
    PROJECTION_QUEUE: {
      send: vi.fn().mockResolvedValue(undefined),
    },
    ADMIN_TOKEN: 'test',
    BOT_USER_AGENT: 'test',
    DEFAULT_CRAWL_DELAY_MS: '2000',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
  } as any;
}

describe('Parser Worker', () => {
  it('parses valid recipe HTML, writes KV, enqueues projection, discovers links, marks done', async () => {
    const msg = createMessage({
      url: 'https://example.com/recipe/1',
      domain: 'example.com',
      html: VALID_HTML,
    });
    const batch = createBatch([msg]);
    const env = createEnv();

    await parser.queue(batch, env);

    // KV put called with recipe: prefix and 1-year TTL
    expect(env.RECIPES_KV.put).toHaveBeenCalledOnce();
    const [kvKey, kvValue, kvOpts] = env.RECIPES_KV.put.mock.calls[0];
    expect(kvKey).toMatch(/^recipe:/);
    expect(kvOpts).toEqual({ expirationTtl: 31_536_000 });
    const doc = JSON.parse(kvValue as string);
    expect(doc.title).toBe('Test Pasta');
    expect(doc.ingredients).toEqual(['pasta', 'sauce']);

    // Projection enqueued
    expect(env.PROJECTION_QUEUE.send).toHaveBeenCalledOnce();
    const [projBody] = env.PROJECTION_QUEUE.send.mock.calls[0];
    expect(projBody.doc.title).toBe('Test Pasta');

    // Link discovery: 2 same-domain links discovered + 1 crawl status update = 3 DB calls
    // (external link skipped)
    expect(env.DB.prepare).toHaveBeenCalledTimes(3);

    // Last DB call is the status update to 'done'
    const lastSql = env.DB.prepare.mock.calls[2][0] as string;
    expect(lastSql).toContain('UPDATE crawl_queue SET status');

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('marks no_schema when HTML has no ld+json', async () => {
    const msg = createMessage({
      url: 'https://example.com/page',
      domain: 'example.com',
      html: NO_SCHEMA_HTML,
    });
    const batch = createBatch([msg]);
    const env = createEnv();

    await parser.queue(batch, env);

    expect(env.DB.prepare).toHaveBeenCalledOnce();
    const bindCall = env.DB.prepare.mock.results[0].value.bind;
    expect(bindCall).toHaveBeenCalledWith('no_schema', 'https://example.com/page');
    expect(env.RECIPES_KV.put).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('marks no_schema when title is empty', async () => {
    const msg = createMessage({
      url: 'https://example.com/empty',
      domain: 'example.com',
      html: EMPTY_TITLE_HTML,
    });
    const batch = createBatch([msg]);
    const env = createEnv();

    await parser.queue(batch, env);

    expect(env.RECIPES_KV.put).not.toHaveBeenCalled();
    const bindCall = env.DB.prepare.mock.results[0].value.bind;
    expect(bindCall).toHaveBeenCalledWith('no_schema', 'https://example.com/empty');
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('marks no_schema when ingredients are empty', async () => {
    const msg = createMessage({
      url: 'https://example.com/no-ing',
      domain: 'example.com',
      html: NO_INGREDIENTS_HTML,
    });
    const batch = createBatch([msg]);
    const env = createEnv();

    await parser.queue(batch, env);

    expect(env.RECIPES_KV.put).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('retries on unexpected error', async () => {
    const msg = createMessage({
      url: 'https://example.com/recipe/1',
      domain: 'example.com',
      html: VALID_HTML,
    });
    const batch = createBatch([msg]);
    const env = createEnv();
    env.RECIPES_KV.put.mockRejectedValue(new Error('KV write failed'));

    await parser.queue(batch, env);

    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('processes multiple messages independently', async () => {
    const msg1 = createMessage(
      { url: 'https://example.com/r/1', domain: 'example.com', html: VALID_HTML },
      'msg-1',
    );
    const msg2 = createMessage(
      { url: 'https://example.com/no', domain: 'example.com', html: NO_SCHEMA_HTML },
      'msg-2',
    );
    const batch = createBatch([msg1, msg2]);
    const env = createEnv();

    await parser.queue(batch, env);

    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.ack).toHaveBeenCalledOnce();
    expect(env.RECIPES_KV.put).toHaveBeenCalledOnce(); // only msg1
  });
});
