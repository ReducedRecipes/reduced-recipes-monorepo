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

import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

function createEnv() {
  return {
    DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
        all: vi.fn().mockResolvedValue({ results: [] }),
        first: vi.fn().mockResolvedValue(null),
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
  it('does nothing when no pending URLs and no sitemap due', async () => {
    const env = createEnv();

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
        // DISTINCT domain query
        return {
          all: vi.fn().mockResolvedValue({ results: [{ domain: 'example.com' }] }),
        };
      }
      if (callCount === 2) {
        // Per-domain URL query — prepare().bind() returns a statement for batch
        return {
          bind: vi.fn().mockReturnValue({
            run: vi.fn().mockResolvedValue({}),
            all: vi.fn().mockResolvedValue({ results: dueUrls }),
          }),
        };
      }
      if (callCount === 3) {
        // ingestNextSitemap: SELECT domain — no domain due
        return {
          first: vi.fn().mockResolvedValue(null),
        };
      }
      // Mark in-flight UPDATE
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      };
    });

    // DB.batch returns per-domain URL results
    env.DB.batch.mockResolvedValueOnce([
      { results: dueUrls },
    ]);

    await orchestrator.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(env.CRAWL_QUEUE.sendBatch).toHaveBeenCalledOnce();
    const sentBatch = env.CRAWL_QUEUE.sendBatch.mock.calls[0]![0] as any[];
    expect(sentBatch).toHaveLength(2);
    expect(sentBatch[0]!.body).toEqual(dueUrls[0]);
  });

  it('ingests sitemap when domain is due for spidering', async () => {
    const env = createEnv();

    (parseSitemap as ReturnType<typeof vi.fn>).mockResolvedValue([
      'https://example.com/recipe/1',
      'https://example.com/about',
    ]);
    (isRecipeUrl as ReturnType<typeof vi.fn>).mockImplementation((url: string) =>
      url.includes('/recipe/'),
    );

    let callCount = 0;
    env.DB.prepare.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // DISTINCT domain query — no pending URLs
        return {
          all: vi.fn().mockResolvedValue({ results: [] }),
        };
      }
      if (callCount === 2) {
        // ingestNextSitemap: SELECT domain due for spidering
        return {
          first: vi.fn().mockResolvedValue({
            domain: 'example.com',
            sitemap_url: 'https://example.com/sitemap.xml',
          }),
        };
      }
      // INSERT OR IGNORE for recipe URLs + UPDATE last_spidered
      return {
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      };
    });

    await orchestrator.scheduled({} as ScheduledEvent, env, {} as ExecutionContext);

    expect(parseSitemap).toHaveBeenCalledWith('https://example.com/sitemap.xml');
    expect(env.DB.batch).toHaveBeenCalled();
  });
});
