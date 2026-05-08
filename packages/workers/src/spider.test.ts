import { describe, it, expect, vi, afterEach } from 'vitest';
import spider from './spider';

vi.mock('@rr/shared/sitemap', () => ({
  parseSitemap: vi.fn(),
  isRecipeUrl: vi.fn(),
}));

vi.mock('@rr/shared/utils', () => ({
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
    CRAWL_DB: {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
          first: vi.fn().mockResolvedValue(null),
        }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn().mockResolvedValue({}),
      }),
      batch: vi.fn(async () => []),
    },
  } as any;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Spider Worker', () => {
  it('does nothing when no domain is due', async () => {
    const env = createEnv();
    const response = await spider.fetch(new Request('http://localhost/trigger'), env);
    const body = await response.json() as { ok: boolean; domain: string | null; inserted: number };

    expect(body.ok).toBe(true);
    expect(body.domain).toBeNull();
    expect(body.inserted).toBe(0);
  });

  it('inserts recipe URLs from sitemap into crawl_queue', async () => {
    const env = createEnv();
    const sitemapUrls = [
      'https://example.com/recipes/foo',
      'https://example.com/recipes/bar',
      'https://example.com/about',
    ];

    env.CRAWL_DB.prepare.mockReturnValueOnce({
      first: vi.fn().mockResolvedValue({ domain: 'example.com', sitemap_url: 'https://example.com/sitemap.xml' }),
    });

    (parseSitemap as ReturnType<typeof vi.fn>).mockResolvedValue(sitemapUrls);
    (isRecipeUrl as ReturnType<typeof vi.fn>).mockImplementation((u: string) => u.includes('/recipes/'));

    const response = await spider.fetch(new Request('http://localhost/trigger'), env);
    const body = await response.json() as { ok: boolean; domain: string | null; inserted: number };

    expect(body.ok).toBe(true);
    expect(body.domain).toBe('example.com');
    expect(body.inserted).toBe(2);
    expect(env.CRAWL_DB.batch).toHaveBeenCalledOnce();
  });

  it('returns 404 for unknown paths', async () => {
    const env = createEnv();
    const response = await spider.fetch(new Request('http://localhost/unknown'), env);
    expect(response.status).toBe(404);
  });
});
