import { describe, it, expect, vi, beforeEach } from 'vitest';
import projection from './projection';
import type { ProjectionJob, RecipeDocument } from '@rr/shared';

vi.mock('./helpers/dietary-inference', () => ({
  inferDietaryBitmask: vi.fn().mockResolvedValue(3),
}));

import { inferDietaryBitmask } from './helpers/dietary-inference';

function makeDoc(overrides: Partial<RecipeDocument> = {}): RecipeDocument {
  return {
    id: 'recipe-1',
    source_url: 'https://example.com/recipe/1',
    domain: 'example.com',
    title: 'Test Recipe',
    image_url: 'https://example.com/img.jpg',
    author: 'Chef Test',
    yields: '4 servings',
    prep_time: 10,
    cook_time: 20,
    total_time: 30,
    ingredients: ['flour', 'sugar'],
    instructions: ['mix', 'bake'],
    tags: ['dessert', 'easy'],
    cuisine: 'American',
    category: 'Dessert',
    keywords: ['baking'],
    schema_valid: true,
    extracted_at: '2024-06-01T00:00:00Z',
    last_checked: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

function createMessage(body: ProjectionJob, id = 'msg-1') {
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
    queue: 'projection-jobs',
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<ProjectionJob>;
}

function createEnv() {
  const batchFn = vi.fn().mockResolvedValue([]);
  const bindResult = {
    run: vi.fn().mockResolvedValue({}),
    first: vi.fn().mockResolvedValue(null), // no duplicate by default
  };
  const prepareFn = vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnValue(bindResult),
  });
  return {
    DB: {
      prepare: prepareFn,
      batch: batchFn,
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

describe('Projection Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts recipe, deletes old tags, inserts new tags, updates domain counter', async () => {
    const doc = makeDoc({ tags: ['dessert', 'easy'] });
    const msg = createMessage({ id: doc.id, doc });
    const batch = createBatch([msg]);
    const env = createEnv();

    await projection.queue(batch, env);

    // prepare calls: 1 dupe check + 1 upsert + 1 delete tags + 2 tag inserts + 2 FTS (delete+insert) + 1 domain = 8
    expect(env.DB.prepare).toHaveBeenCalledTimes(8);

    // Verify dupe check SQL
    const dupeCall = env.DB.prepare.mock.calls[0]![0] as string;
    expect(dupeCall).toContain('SELECT id FROM recipes WHERE title');

    // Verify upsert SQL
    const upsertCall = env.DB.prepare.mock.calls[1]![0] as string;
    expect(upsertCall).toContain('INSERT OR IGNORE INTO recipes');

    // Verify tag delete
    const deleteCall = env.DB.prepare.mock.calls[2]![0] as string;
    expect(deleteCall).toContain('DELETE FROM recipe_tags WHERE recipe_id');

    // Verify tag inserts
    const tagCall = env.DB.prepare.mock.calls[3]![0] as string;
    expect(tagCall).toContain('INSERT OR IGNORE INTO recipe_tags');

    // batch() should be called once (all statements < 100 chunk size)
    expect(env.DB.batch).toHaveBeenCalledOnce();

    expect(msg.ack).toHaveBeenCalledOnce();
    expect(msg.retry).not.toHaveBeenCalled();
  });

  it('limits tags to 20', async () => {
    const manyTags = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    const doc = makeDoc({ tags: manyTags });
    const msg = createMessage({ id: doc.id, doc });
    const batch = createBatch([msg]);
    const env = createEnv();

    await projection.queue(batch, env);

    // 1 dupe check + 1 upsert + 1 delete + 20 tag inserts + 2 FTS + 1 domain = 26
    expect(env.DB.prepare).toHaveBeenCalledTimes(26);
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('handles recipes with no tags', async () => {
    const doc = makeDoc({ tags: [] });
    const msg = createMessage({ id: doc.id, doc });
    const batch = createBatch([msg]);
    const env = createEnv();

    await projection.queue(batch, env);

    // 1 dupe check + 1 upsert + 1 delete + 0 tag inserts + 2 FTS + 1 domain = 6
    expect(env.DB.prepare).toHaveBeenCalledTimes(6);
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  it('retries on error', async () => {
    const doc = makeDoc();
    const msg = createMessage({ id: doc.id, doc });
    const batch = createBatch([msg]);
    const env = createEnv();
    env.DB.batch.mockRejectedValue(new Error('D1 error'));

    await projection.queue(batch, env);

    expect(msg.retry).toHaveBeenCalledOnce();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('processes multiple messages independently', async () => {
    const doc1 = makeDoc({ id: 'r-1', tags: ['a'] });
    const doc2 = makeDoc({ id: 'r-2', tags: ['b'] });
    const msg1 = createMessage({ id: doc1.id, doc: doc1 }, 'msg-1');
    const msg2 = createMessage({ id: doc2.id, doc: doc2 }, 'msg-2');
    const batch = createBatch([msg1, msg2]);
    const env = createEnv();

    await projection.queue(batch, env);

    expect(msg1.ack).toHaveBeenCalledOnce();
    expect(msg2.ack).toHaveBeenCalledOnce();
  });

  it('converts schema_valid boolean to integer', async () => {
    const doc = makeDoc({ schema_valid: false, tags: [] });
    const msg = createMessage({ id: doc.id, doc });
    const batch = createBatch([msg]);
    const env = createEnv();

    await projection.queue(batch, env);

    // Second prepare call is the upsert (first is dupe check)
    const upsertBind = env.DB.prepare.mock.results[1]!.value.bind;
    expect(upsertBind).toHaveBeenCalledWith(
      doc.id, doc.source_url, doc.domain, doc.title,
      doc.image_url, doc.author, doc.yields,
      doc.prep_time, doc.cook_time, doc.total_time,
      doc.cuisine, doc.category,
      0, // schema_valid = false → 0
      doc.extracted_at,
    );
  });

  it('skips duplicate recipes (same title + domain)', async () => {
    const doc = makeDoc();
    const msg = createMessage({ id: doc.id, doc });
    const batch = createBatch([msg]);
    const env = createEnv();

    // Mock duplicate found
    const dupeResult = {
      run: vi.fn(),
      first: vi.fn().mockResolvedValue({ id: 'existing-id' }),
    };
    env.DB.prepare = vi.fn().mockReturnValueOnce({
      bind: vi.fn().mockReturnValue(dupeResult),
    });

    await projection.queue(batch, env);

    // Should skip — no batch call, just ack
    expect(env.DB.batch).not.toHaveBeenCalled();
    expect(msg.ack).toHaveBeenCalledOnce();
  });

  describe('dietary inference integration', () => {
    it('calls inferDietaryBitmask and updates bitmask when AI is available', async () => {
      const doc = makeDoc({ id: 'recipe-ai', tags: [] });
      const msg = createMessage({ id: doc.id, doc });
      const batch = createBatch([msg]);
      const env = createEnv();
      env.AI = {} as any; // Add AI binding

      await projection.queue(batch, env);

      expect(inferDietaryBitmask).toHaveBeenCalledWith(doc, env.AI);

      // The last prepare call should be the bitmask UPDATE
      const lastCall = env.DB.prepare.mock.calls[env.DB.prepare.mock.calls.length - 1]![0] as string;
      expect(lastCall).toContain('UPDATE recipes SET dietary_bitmask');

      expect(msg.ack).toHaveBeenCalledOnce();
    });

    it('skips inference when AI binding is undefined', async () => {
      const doc = makeDoc({ id: 'recipe-no-ai', tags: [] });
      const msg = createMessage({ id: doc.id, doc });
      const batch = createBatch([msg]);
      const env = createEnv(); // No AI binding

      await projection.queue(batch, env);

      expect(inferDietaryBitmask).not.toHaveBeenCalled();
      expect(msg.ack).toHaveBeenCalledOnce();
    });

    it('acks message even when dietary inference throws', async () => {
      vi.mocked(inferDietaryBitmask).mockRejectedValueOnce(new Error('AI unavailable'));

      const doc = makeDoc({ id: 'recipe-fail', tags: [] });
      const msg = createMessage({ id: doc.id, doc });
      const batch = createBatch([msg]);
      const env = createEnv();
      env.AI = {} as any;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await projection.queue(batch, env);

      // Recipe upsert should have succeeded
      expect(env.DB.batch).toHaveBeenCalled();
      // Message should be ack'd despite inference failure
      expect(msg.ack).toHaveBeenCalledOnce();
      expect(msg.retry).not.toHaveBeenCalled();
      // Warning logged
      expect(warnSpy).toHaveBeenCalledWith(
        'Dietary inference failed for recipe',
        'recipe-fail',
        expect.any(Error),
      );

      warnSpy.mockRestore();
    });
  });
});
