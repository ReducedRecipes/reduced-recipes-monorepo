import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '@rr/shared/env';
import type { IngredientParseJob } from '@rr/shared';
import { handleIngredientParseQueue } from './queue-consumer';

vi.mock('./ingredient-canon', () => ({
  resolveCanon: vi.fn().mockResolvedValue({ canonical_name: 'flour', category: 'Pantry' }),
}));

import { resolveCanon } from './ingredient-canon';

function makeStmt() {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
    run: vi.fn().mockResolvedValue({ results: [], success: true }),
  };
}

function createEnv(hasAI = false): Env {
  const USERS_DB = {
    prepare: vi.fn().mockReturnValue(makeStmt()),
    batch: vi.fn().mockResolvedValue([]),
  };

  const AI = hasAI
    ? {
        run: vi.fn().mockResolvedValue({
          response: '{"name": "chicken breast", "quantity": 2, "unit": "lbs"}',
        }),
      }
    : undefined;

  return {
    DB: { prepare: vi.fn().mockReturnValue(makeStmt()) },
    RECIPES_KV: {} as unknown,
    CACHE_KV: {} as unknown,
    IMAGES_R2: {} as unknown,
    CRAWL_QUEUE: {} as unknown,
    PARSE_QUEUE: {} as unknown,
    PROJECTION_QUEUE: {} as unknown,
    ADMIN_TOKEN: 'test',
    BOT_USER_AGENT: 'test',
    DEFAULT_CRAWL_DELAY_MS: '500',
    MAX_QUEUE_BATCH: '10',
    ENVIRONMENT: 'test',
    USERS_DB,
    SESSION_KV: {} as unknown,
    AI,
  } as unknown as Env;
}

interface MockMessage<T> {
  body: T;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
}

function createBatch(jobs: IngredientParseJob[]): MessageBatch<IngredientParseJob> {
  const messages: MockMessage<IngredientParseJob>[] = jobs.map((body) => ({
    body,
    ack: vi.fn(),
    retry: vi.fn(),
  }));

  return {
    messages,
    queue: 'ingredient-parse',
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<IngredientParseJob>;
}

describe('handleIngredientParseQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses ingredients with rule-based parser and updates D1', async () => {
    const env = createEnv();
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [
          { id: 'item-1', original_text: '2 cups flour' },
          { id: 'item-2', original_text: '1 tsp salt' },
        ],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    // Verify batch was called with UPDATE statements
    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    expect(usersDb.batch).toHaveBeenCalledTimes(1);
    expect(usersDb.batch.mock.calls[0]![0]).toHaveLength(2);

    // Verify message was acked
    const msg = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    expect(msg.ack).toHaveBeenCalled();
  });

  it('falls back to AI when rule-based returns no quantity and no unit', async () => {
    const env = createEnv(true);
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [
          { id: 'item-1', original_text: 'a pinch of saffron threads' },
        ],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    expect(usersDb.batch).toHaveBeenCalledTimes(1);

    const msg = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    expect(msg.ack).toHaveBeenCalled();
  });

  it('retries on error', async () => {
    const env = createEnv();
    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    usersDb.batch.mockRejectedValueOnce(new Error('D1 error'));

    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [{ id: 'item-1', original_text: '2 cups flour' }],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    const msg = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    expect(msg.retry).toHaveBeenCalled();
    expect(msg.ack).not.toHaveBeenCalled();
  });

  it('handles empty items array', async () => {
    const env = createEnv();
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    // No batch update when no items
    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    expect(usersDb.batch).not.toHaveBeenCalled();

    const msg = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    expect(msg.ack).toHaveBeenCalled();
  });

  it('processes multiple messages in a batch', async () => {
    const env = createEnv();
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [{ id: 'item-1', original_text: '2 cups flour' }],
      },
      {
        shopping_list_id: 'list-2',
        recipe_id: 'recipe-2',
        items: [{ id: 'item-2', original_text: '1 lb chicken' }],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    expect(usersDb.batch).toHaveBeenCalledTimes(2);

    const msg0 = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    const msg1 = batch.messages[1] as unknown as MockMessage<IngredientParseJob>;
    expect(msg0.ack).toHaveBeenCalled();
    expect(msg1.ack).toHaveBeenCalled();
  });

  it('calls resolveCanon after parsing and includes canonical_name and category in D1 update', async () => {
    const mockResolveCanon = vi.mocked(resolveCanon);
    mockResolveCanon.mockResolvedValueOnce({ canonical_name: 'flour', category: 'Pantry' });

    const env = createEnv();
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [{ id: 'item-1', original_text: '2 cups flour' }],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    expect(mockResolveCanon).toHaveBeenCalledWith('flour', env);

    const usersDb = env.USERS_DB as unknown as { prepare: ReturnType<typeof vi.fn> };
    expect(usersDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('canonical_name = ?, category = ?'),
    );

    // Verify bind was called with canonical_name and category
    const stmt = usersDb.prepare.mock.results[0]!.value;
    expect(stmt.bind).toHaveBeenCalledWith(
      'flour', // item
      2, // quantity
      'cup', // unit
      0, // parse_failed
      'flour', // canonical_name
      'Pantry', // category
      expect.any(String), // updated_at
      'item-1', // id
    );
  });

  it('gracefully handles resolveCanon failure — sets canonical_name and category to null', async () => {
    const mockResolveCanon = vi.mocked(resolveCanon);
    mockResolveCanon.mockRejectedValueOnce(new Error('KV/D1/AI all failed'));

    const env = createEnv();
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [{ id: 'item-1', original_text: '1 lb chicken' }],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    // Item should still be updated (parsing completes) with null canon fields
    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    expect(usersDb.batch).toHaveBeenCalledTimes(1);

    const msg = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    expect(msg.ack).toHaveBeenCalled();

    // Verify bind was called with null canonical_name and category
    const preparedDb = env.USERS_DB as unknown as { prepare: ReturnType<typeof vi.fn> };
    const stmt = preparedDb.prepare.mock.results[0]!.value;
    expect(stmt.bind).toHaveBeenCalledWith(
      'chicken', // item
      1, // quantity
      'lb', // unit
      0, // parse_failed
      null, // canonical_name (failed)
      null, // category (failed)
      expect.any(String), // updated_at
      'item-1', // id
    );
  });

  it('resolves canon for each item in a batch job', async () => {
    const mockResolveCanon = vi.mocked(resolveCanon);
    mockResolveCanon
      .mockResolvedValueOnce({ canonical_name: 'flour', category: 'Pantry' })
      .mockResolvedValueOnce({ canonical_name: 'salt', category: 'Spices & Seasonings' });

    const env = createEnv();
    const batch = createBatch([
      {
        shopping_list_id: 'list-1',
        recipe_id: 'recipe-1',
        items: [
          { id: 'item-1', original_text: '2 cups flour' },
          { id: 'item-2', original_text: '1 tsp salt' },
        ],
      },
    ]);

    await handleIngredientParseQueue(batch, env);

    expect(mockResolveCanon).toHaveBeenCalledTimes(2);
    expect(mockResolveCanon).toHaveBeenCalledWith('flour', env);
    expect(mockResolveCanon).toHaveBeenCalledWith('salt', env);

    const usersDb = env.USERS_DB as unknown as { batch: ReturnType<typeof vi.fn> };
    expect(usersDb.batch).toHaveBeenCalledTimes(1);
    expect(usersDb.batch.mock.calls[0]![0]).toHaveLength(2);

    const msg = batch.messages[0] as unknown as MockMessage<IngredientParseJob>;
    expect(msg.ack).toHaveBeenCalled();
  });
});
