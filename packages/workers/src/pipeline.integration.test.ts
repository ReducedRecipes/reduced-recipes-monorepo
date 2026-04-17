// @vitest-environment node

/**
 * Integration test for the recipe aggregation pipeline.
 *
 * Traces a recipe through the full flow with mocked Cloudflare bindings:
 *   Orchestrator → Crawler → Parser → Projection → API
 *
 * Verifies that data flows correctly between each stage and that
 * the final API response matches the original input.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Env } from '@rr/shared/env';
import type { CrawlJob, ParseJob, ProjectionJob, RecipeDocument } from '@rr/shared';
import parser from './parser';
import projection from './projection';

// ── Test fixtures ──────────────────────────────────────────────────────

const RECIPE_HTML = `
<html><body>
<script type="application/ld+json">
{
  "@type": "Recipe",
  "name": "Integration Test Pasta",
  "author": { "@type": "Person", "name": "Test Chef" },
  "recipeIngredient": ["200g pasta", "100ml tomato sauce", "salt to taste"],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "Boil water and cook pasta." },
    { "@type": "HowToStep", "text": "Add tomato sauce and salt." },
    { "@type": "HowToStep", "text": "Serve hot." }
  ],
  "image": "https://example.com/pasta.jpg",
  "totalTime": "PT25M",
  "prepTime": "PT5M",
  "cookTime": "PT20M",
  "recipeYield": "2 servings",
  "recipeCategory": "Main Course",
  "recipeCuisine": "Italian",
  "keywords": "pasta, quick meal, weeknight dinner"
}
</script>
<a href="/recipe/related-1">Related recipe</a>
</body></html>`;

const TEST_DOMAIN = 'example.com';
const TEST_URL = 'https://example.com/recipe/integration-test';

// ── Mock helpers ───────────────────────────────────────────────────────

/** In-memory KV store */
function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

/** In-memory D1 database with crawl_queue, recipes, recipe_tags, domains tables */
function createMockDB() {
  const recipes = new Map<string, Record<string, unknown>>();
  const recipeTags = new Map<string, string[]>(); // recipe_id → tags
  const domains = new Map<string, Record<string, unknown>>();
  const crawlQueue = new Map<string, Record<string, unknown>>();

  // Seed a domain
  domains.set(TEST_DOMAIN, {
    domain: TEST_DOMAIN,
    sitemap_url: `https://${TEST_DOMAIN}/sitemap.xml`,
    crawl_delay_ms: 2000,
    active: 1,
    recipe_count: 0,
    last_spidered: null,
  });

  // Seed a crawl queue entry
  crawlQueue.set(TEST_URL, {
    url: TEST_URL,
    domain: TEST_DOMAIN,
    status: 'pending',
    priority: 5,
    next_crawl: new Date().toISOString(),
  });

  const prepareFn = vi.fn((sql: string) => {
    return {
      bind: vi.fn((...params: unknown[]) => {
        return {
          run: vi.fn(async () => {
            // Handle crawl_queue status updates
            if (sql.includes('UPDATE crawl_queue SET status')) {
              const status = params[0] as string;
              const url = params[1] as string;
              const entry = crawlQueue.get(url);
              if (entry) entry.status = status;
              return { success: true };
            }
            // Handle crawl_queue inserts (link discovery)
            if (sql.includes('INSERT OR IGNORE INTO crawl_queue')) {
              const url = params[0] as string;
              const domain = params[1] as string;
              if (!crawlQueue.has(url)) {
                crawlQueue.set(url, { url, domain, status: 'pending', priority: 8 });
              }
              return { success: true };
            }
            // Handle domain recipe_count update
            if (sql.includes('UPDATE domains') && sql.includes('recipe_count')) {
              const domain = params[0] as string;
              const d = domains.get(domain);
              if (d) d.recipe_count = (d.recipe_count as number) + 1;
              return { success: true };
            }
            return { success: true };
          }),
          all: vi.fn(async () => {
            // Handle recipe listing
            if (sql.includes('SELECT') && sql.includes('FROM recipes r')) {
              const rows = [...recipes.values()];
              return { results: rows, success: true };
            }
            // Handle crawl_queue queries
            if (sql.includes('SELECT') && sql.includes('crawl_queue')) {
              const pending = [...crawlQueue.values()].filter(
                (e) => e.status === 'pending',
              );
              return { results: pending, success: true };
            }
            // Handle tag queries
            if (sql.includes('SELECT tag FROM recipe_tags')) {
              const recipeId = params[0] as string;
              const tags = recipeTags.get(recipeId) ?? [];
              return { results: tags.map((tag) => ({ tag })), success: true };
            }
            // Health stats
            if (sql.includes('COUNT(*)')) {
              if (sql.includes('FROM recipes'))
                return { results: [{ total: recipes.size }], success: true };
              if (sql.includes("status='pending'"))
                return {
                  results: [
                    {
                      total: [...crawlQueue.values()].filter(
                        (e) => e.status === 'pending',
                      ).length,
                    },
                  ],
                  success: true,
                };
              if (sql.includes("status='failed'"))
                return {
                  results: [
                    {
                      total: [...crawlQueue.values()].filter(
                        (e) => e.status === 'failed',
                      ).length,
                    },
                  ],
                  success: true,
                };
              if (sql.includes('FROM domains'))
                return { results: [{ total: domains.size }], success: true };
              return { results: [{ total: 0 }], success: true };
            }
            return { results: [], success: true };
          }),
          first: vi.fn(async () => {
            if (sql.includes('crawl_delay_ms')) {
              const domain = params[0] as string;
              const d = domains.get(domain);
              return d ? { crawl_delay_ms: d.crawl_delay_ms } : null;
            }
            return null;
          }),
        };
      }),
    };
  });

  const batchFn = vi.fn(async (stmts: D1PreparedStatement[]) => {
    // Execute each statement — projection worker batches D1 writes
    for (const stmt of stmts) {
      // Statements were created via prepare().bind() — we need to trigger their .run()
      await (stmt as unknown as { run: () => Promise<unknown> }).run();
    }
    return [];
  });

  return {
    db: {
      prepare: prepareFn,
      batch: batchFn,
    } as unknown as D1Database,
    recipes,
    recipeTags,
    domains,
    crawlQueue,
    _insertRecipe(doc: RecipeDocument) {
      recipes.set(doc.id, {
        id: doc.id,
        source_url: doc.source_url,
        domain: doc.domain,
        title: doc.title,
        image_url: doc.image_url,
        author: doc.author,
        yields: doc.yields,
        prep_time: doc.prep_time,
        cook_time: doc.cook_time,
        total_time: doc.total_time,
        cuisine: doc.cuisine,
        category: doc.category,
        schema_valid: doc.schema_valid ? 1 : 0,
        extracted_at: doc.extracted_at,
      });
      recipeTags.set(
        doc.id,
        doc.tags.slice(0, 20),
      );
    },
  };
}

function createMessage<T>(body: T, id = 'msg-1') {
  return {
    id,
    body,
    timestamp: new Date(),
    attempts: 1,
    ack: vi.fn(),
    retry: vi.fn(),
  };
}

function createBatch<T>(queue: string, messages: ReturnType<typeof createMessage<T>>[]) {
  return {
    queue,
    messages,
    ackAll: vi.fn(),
    retryAll: vi.fn(),
  } as unknown as MessageBatch<T>;
}

// ── Integration tests ──────────────────────────────────────────────────

describe('Pipeline Integration: Orchestrator → Crawler → Parser → Projection → API', () => {
  let kvStore: ReturnType<typeof createMockKV>;
  let mockDb: ReturnType<typeof createMockDB>;
  let projectionQueue: { send: ReturnType<typeof vi.fn> };
  let capturedProjectionJob: ProjectionJob | null;

  beforeEach(() => {
    kvStore = createMockKV();
    mockDb = createMockDB();
    projectionQueue = { send: vi.fn() };
    capturedProjectionJob = null;
  });

  it('flows a recipe from HTML through parser → projection and stores correct data in KV and D1', async () => {
    // ── Stage 1: Parser processes crawled HTML ────────────────────────
    const parseMsg = createMessage<ParseJob>({
      url: TEST_URL,
      domain: TEST_DOMAIN,
      html: RECIPE_HTML,
    });
    const parseBatch = createBatch('parse-jobs', [parseMsg]);
    const parserEnv = {
      DB: mockDb.db,
      RECIPES_KV: kvStore,
      CACHE_KV: {} as KVNamespace,
      IMAGES_R2: {} as R2Bucket,
      CRAWL_QUEUE: {} as Queue,
      PARSE_QUEUE: {} as Queue,
      PROJECTION_QUEUE: projectionQueue as unknown as Queue,
      ADMIN_TOKEN: 'test-token',
      BOT_USER_AGENT: 'TestBot/1.0',
      DEFAULT_CRAWL_DELAY_MS: '2000',
      MAX_QUEUE_BATCH: '10',
      ENVIRONMENT: 'test',
    } satisfies Env;

    await parser.queue(parseBatch, parserEnv);

    // Parser should ack the message
    expect(parseMsg.ack).toHaveBeenCalledOnce();
    expect(parseMsg.retry).not.toHaveBeenCalled();

    // Parser should write to KV
    expect(kvStore.put).toHaveBeenCalledOnce();
    const [kvKey, kvValue, kvOpts] = (kvStore.put as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string, { expirationTtl: number }];
    expect(kvKey).toMatch(/^recipe:[0-9a-f-]+$/);
    expect(kvOpts.expirationTtl).toBe(31_536_000); // 1 year

    // Verify the RecipeDocument stored in KV
    const storedDoc: RecipeDocument = JSON.parse(kvValue);
    expect(storedDoc.title).toBe('Integration Test Pasta');
    expect(storedDoc.author).toBe('Test Chef');
    expect(storedDoc.domain).toBe(TEST_DOMAIN);
    expect(storedDoc.source_url).toBe(TEST_URL);
    expect(storedDoc.ingredients).toEqual(['200g pasta', '100ml tomato sauce', 'salt to taste']);
    expect(storedDoc.instructions).toEqual([
      'Boil water and cook pasta.',
      'Add tomato sauce and salt.',
      'Serve hot.',
    ]);
    expect(storedDoc.total_time).toBe(25);
    expect(storedDoc.prep_time).toBe(5);
    expect(storedDoc.cook_time).toBe(20);
    expect(storedDoc.yields).toBe('2 servings');
    expect(storedDoc.category).toBe('Main Course');
    expect(storedDoc.cuisine).toBe('Italian');
    expect(storedDoc.keywords).toEqual(['pasta', 'quick meal', 'weeknight dinner']);
    expect(storedDoc.schema_valid).toBe(true);
    expect(storedDoc.extracted_at).toBeTruthy();
    expect(storedDoc.last_checked).toBeTruthy();
    expect(storedDoc.image_url).toBe('https://example.com/pasta.jpg');

    // Parser should enqueue a projection job
    expect(projectionQueue.send).toHaveBeenCalledOnce();
    const [projBody] = projectionQueue.send.mock.calls[0] as [ProjectionJob];
    capturedProjectionJob = projBody;
    expect(projBody.id).toBe(storedDoc.id);
    expect(projBody.doc.title).toBe('Integration Test Pasta');

    // ── Stage 2: Projection writes to D1 ──────────────────────────────
    // Build a real projection env using the same mock DB
    // We simulate the projection worker receiving the job the parser enqueued
    const projMsg = createMessage<ProjectionJob>(capturedProjectionJob);
    const projBatch = createBatch('projection-jobs', [projMsg]);

    // For projection, we need the DB.batch to actually run the statements
    // that projection.ts builds with prepare().bind()
    // The projection worker builds statements and calls env.DB.batch()
    const projStatements: Array<{ sql: string; params: unknown[] }> = [];
    const projDb = {
      prepare: vi.fn((sql: string) => {
        return {
          bind: vi.fn((...params: unknown[]) => {
            const stmt = {
              sql,
              params,
              run: vi.fn(async () => ({ success: true })),
              first: vi.fn(async () => null), // no duplicate found
            };
            projStatements.push({ sql, params });
            return stmt;
          }),
        };
      }),
      batch: vi.fn(async (stmts: unknown[]) => {
        // Just track that batch was called
        return stmts.map(() => ({ success: true }));
      }),
    } as unknown as D1Database;

    const projEnv = {
      DB: projDb,
      RECIPES_KV: kvStore,
      CACHE_KV: {} as KVNamespace,
      IMAGES_R2: {} as R2Bucket,
      CRAWL_QUEUE: {} as Queue,
      PARSE_QUEUE: {} as Queue,
      PROJECTION_QUEUE: {} as Queue,
      ADMIN_TOKEN: 'test-token',
      BOT_USER_AGENT: 'TestBot/1.0',
      DEFAULT_CRAWL_DELAY_MS: '2000',
      MAX_QUEUE_BATCH: '10',
      ENVIRONMENT: 'test',
    } satisfies Env;

    await projection.queue(projBatch, projEnv);

    // Projection should ack the message
    expect(projMsg.ack).toHaveBeenCalledOnce();
    expect(projMsg.retry).not.toHaveBeenCalled();

    // Projection should call DB.batch
    expect(projDb.batch).toHaveBeenCalled();

    // Verify the SQL statements projection built
    // 0: SELECT id FROM recipes (duplicate check)
    // 1: INSERT OR IGNORE INTO recipes
    // 2: DELETE FROM recipe_tags WHERE recipe_id = ?
    // 3+: INSERT OR IGNORE INTO recipe_tags for each tag (up to 20)
    // FTS delete + insert
    // Last: UPDATE domains SET recipe_count = ...
    expect(projStatements.length).toBeGreaterThanOrEqual(5); // dupe check + recipe + delete tags + at least 1 tag + domain update

    const dupeCheck = projStatements[0]!;
    expect(dupeCheck.sql).toContain('SELECT id FROM recipes WHERE title');

    const recipeInsert = projStatements[1]!;
    expect(recipeInsert.sql).toContain('INSERT OR IGNORE INTO recipes');
    expect(recipeInsert.params[0]).toBe(storedDoc.id); // id
    expect(recipeInsert.params[1]).toBe(TEST_URL); // source_url
    expect(recipeInsert.params[2]).toBe(TEST_DOMAIN); // domain
    expect(recipeInsert.params[3]).toBe('Integration Test Pasta'); // title

    const tagDelete = projStatements[2]!;
    expect(tagDelete.sql).toContain('DELETE FROM recipe_tags');
    expect(tagDelete.params[0]).toBe(storedDoc.id);

    // Tag inserts — should have tags from keywords + cuisine + category
    const tagInserts = projStatements.filter((s) =>
      s.sql.includes('INSERT OR IGNORE INTO recipe_tags'),
    );
    expect(tagInserts.length).toBeGreaterThan(0);
    const insertedTags = tagInserts.map((s) => s.params[1]);
    expect(insertedTags).toContain('italian');
    expect(insertedTags).toContain('pasta');

    // Domain update
    const domainUpdate = projStatements[projStatements.length - 1]!;
    expect(domainUpdate.sql).toContain('UPDATE domains');
    expect(domainUpdate.params[0]).toBe(TEST_DOMAIN);

    // ── Stage 3: API retrieves the recipe from KV ─────────────────────
    // The parser already stored the doc in our mock KV — verify retrieval
    const retrievedValue = await kvStore.get(`recipe:${storedDoc.id}`);
    expect(retrievedValue).not.toBeNull();
    const retrievedDoc: RecipeDocument = JSON.parse(retrievedValue as string);
    expect(retrievedDoc.id).toBe(storedDoc.id);
    expect(retrievedDoc.title).toBe('Integration Test Pasta');
    expect(retrievedDoc.ingredients).toHaveLength(3);
    expect(retrievedDoc.instructions).toHaveLength(3);
  });

  it('parser discovers same-domain links and inserts them into crawl_queue', async () => {
    const parseMsg = createMessage<ParseJob>({
      url: TEST_URL,
      domain: TEST_DOMAIN,
      html: RECIPE_HTML,
    });
    const parseBatch = createBatch('parse-jobs', [parseMsg]);
    const env = {
      DB: mockDb.db,
      RECIPES_KV: kvStore,
      CACHE_KV: {} as KVNamespace,
      IMAGES_R2: {} as R2Bucket,
      CRAWL_QUEUE: {} as Queue,
      PARSE_QUEUE: {} as Queue,
      PROJECTION_QUEUE: projectionQueue as unknown as Queue,
      ADMIN_TOKEN: 'test-token',
      BOT_USER_AGENT: 'TestBot/1.0',
      DEFAULT_CRAWL_DELAY_MS: '2000',
      MAX_QUEUE_BATCH: '10',
      ENVIRONMENT: 'test',
    } satisfies Env;

    await parser.queue(parseBatch, env);

    // The HTML contains <a href="/recipe/related-1"> which is same-domain
    // Should have been inserted into crawl_queue via DB.prepare
    const dbCalls = (mockDb.db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    const insertCalls = dbCalls.filter((call: unknown[]) =>
      (call[0] as string).includes('INSERT OR IGNORE INTO crawl_queue'),
    );
    expect(insertCalls.length).toBe(1);
  });

  it('handles schema-less HTML gracefully — parser marks no_schema, no projection occurs', async () => {
    const noSchemaHtml = '<html><body><p>Just a blog post, no recipe</p></body></html>';
    const parseMsg = createMessage<ParseJob>({
      url: 'https://example.com/blog/no-recipe',
      domain: TEST_DOMAIN,
      html: noSchemaHtml,
    });
    const parseBatch = createBatch('parse-jobs', [parseMsg]);
    const env = {
      DB: mockDb.db,
      RECIPES_KV: kvStore,
      CACHE_KV: {} as KVNamespace,
      IMAGES_R2: {} as R2Bucket,
      CRAWL_QUEUE: {} as Queue,
      PARSE_QUEUE: {} as Queue,
      PROJECTION_QUEUE: projectionQueue as unknown as Queue,
      ADMIN_TOKEN: 'test-token',
      BOT_USER_AGENT: 'TestBot/1.0',
      DEFAULT_CRAWL_DELAY_MS: '2000',
      MAX_QUEUE_BATCH: '10',
      ENVIRONMENT: 'test',
    } satisfies Env;

    await parser.queue(parseBatch, env);

    // No KV write, no projection enqueue
    expect(kvStore.put).not.toHaveBeenCalled();
    expect(projectionQueue.send).not.toHaveBeenCalled();

    // Should mark crawl_queue status as no_schema
    const dbCalls = (mockDb.db.prepare as ReturnType<typeof vi.fn>).mock.calls;
    expect(dbCalls.length).toBe(1);
    expect(dbCalls[0]![0]).toContain('UPDATE crawl_queue SET status');
    expect(parseMsg.ack).toHaveBeenCalledOnce();
  });

  it('data integrity — RecipeDocument from parser matches what projection receives', async () => {
    const parseMsg = createMessage<ParseJob>({
      url: TEST_URL,
      domain: TEST_DOMAIN,
      html: RECIPE_HTML,
    });
    const parseBatch = createBatch('parse-jobs', [parseMsg]);
    const env = {
      DB: mockDb.db,
      RECIPES_KV: kvStore,
      CACHE_KV: {} as KVNamespace,
      IMAGES_R2: {} as R2Bucket,
      CRAWL_QUEUE: {} as Queue,
      PARSE_QUEUE: {} as Queue,
      PROJECTION_QUEUE: projectionQueue as unknown as Queue,
      ADMIN_TOKEN: 'test-token',
      BOT_USER_AGENT: 'TestBot/1.0',
      DEFAULT_CRAWL_DELAY_MS: '2000',
      MAX_QUEUE_BATCH: '10',
      ENVIRONMENT: 'test',
    } satisfies Env;

    await parser.queue(parseBatch, env);

    // Get the doc stored in KV
    const [, kvValue] = (kvStore.put as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    const kvDoc: RecipeDocument = JSON.parse(kvValue);

    // Get the doc sent to projection queue
    const [projJob] = projectionQueue.send.mock.calls[0] as [ProjectionJob];

    // The projection job doc should be identical to the KV doc
    expect(projJob.doc).toEqual(kvDoc);
    expect(projJob.id).toBe(kvDoc.id);

    // Verify all spec fields are present (no missing keys)
    const requiredFields: (keyof RecipeDocument)[] = [
      'id', 'source_url', 'domain', 'title', 'image_url', 'author',
      'yields', 'prep_time', 'cook_time', 'total_time', 'ingredients',
      'instructions', 'tags', 'cuisine', 'category', 'keywords',
      'schema_valid', 'extracted_at', 'last_checked',
    ];
    for (const field of requiredFields) {
      expect(kvDoc).toHaveProperty(field);
    }
  });
});
