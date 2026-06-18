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

  it('updates last_spidered even when parseSitemap throws (cron must not lock on bad domain)', async () => {
    const env = createEnv();

    env.CRAWL_DB.prepare.mockReturnValueOnce({
      first: vi.fn().mockResolvedValue({ domain: 'broken.com', sitemap_url: 'https://broken.com/sitemap.xml' }),
    });

    (parseSitemap as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('XML parse failed'));

    const response = await spider.fetch(new Request('http://localhost/trigger'), env);
    const body = await response.json() as { ok: boolean; domain: string | null; inserted: number; error?: string };

    expect(body.ok).toBe(true);
    expect(body.domain).toBe('broken.com');
    expect(body.inserted).toBe(0);
    expect(body.error).toMatch(/XML parse failed/);

    const prepareCalls = (env.CRAWL_DB.prepare as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(prepareCalls.some((sql) => sql.includes('UPDATE domains SET last_spidered'))).toBe(true);
  });

  it('queues every recipe URL when sitemap is larger than the old 5000 cap', async () => {
    const env = createEnv();

    // 6000 URLs > the historical MAX_URLS_PER_RUN cap of 5000. After the fix we
    // should ingest all of them in a single run.
    const sitemapUrls = Array.from({ length: 6000 }, (_, i) => `https://example.com/recipes/${i}`);

    env.CRAWL_DB.prepare.mockReturnValueOnce({
      first: vi.fn().mockResolvedValue({ domain: 'example.com', sitemap_url: 'https://example.com/sitemap.xml' }),
    });

    (parseSitemap as ReturnType<typeof vi.fn>).mockResolvedValue(sitemapUrls);
    (isRecipeUrl as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const response = await spider.fetch(new Request('http://localhost/trigger'), env);
    const body = await response.json() as { ok: boolean; inserted: number; truncated?: boolean };

    expect(body.ok).toBe(true);
    expect(body.inserted).toBe(6000);
    expect(body.truncated).toBeUndefined();
  });

  it('reports truncated=true and partial count when wall-clock budget is exceeded', async () => {
    const env = createEnv();

    const sitemapUrls = Array.from({ length: 1000 }, (_, i) => `https://slow.com/recipes/${i}`);

    env.CRAWL_DB.prepare.mockReturnValueOnce({
      first: vi.fn().mockResolvedValue({ domain: 'slow.com', sitemap_url: 'https://slow.com/sitemap.xml' }),
    });

    (parseSitemap as ReturnType<typeof vi.fn>).mockResolvedValue(sitemapUrls);
    (isRecipeUrl as ReturnType<typeof vi.fn>).mockReturnValue(true);

    // Make each batch take 30s of wall-clock so the 50s budget is blown after
    // the second batch. We use a fake clock so the test runs instantly.
    const realNow = Date.now.bind(Date);
    let virtualNow = realNow();
    const nowSpy = vi.spyOn(Date, 'now').mockImplementation(() => virtualNow);
    env.CRAWL_DB.batch.mockImplementation(async () => {
      virtualNow += 30_000;
      return [];
    });

    const response = await spider.fetch(new Request('http://localhost/trigger'), env);
    const body = await response.json() as { ok: boolean; inserted: number; truncated?: boolean; total?: number };

    expect(body.ok).toBe(true);
    expect(body.truncated).toBe(true);
    expect(body.total).toBe(1000);
    expect(body.inserted).toBeLessThan(1000);
    expect(body.inserted).toBeGreaterThan(0);

    nowSpy.mockRestore();
  });

  it('claims the domain (updates last_spidered) BEFORE parsing the sitemap', async () => {
    // If the Worker is killed mid-parse (e.g. an oversized sitemap exceeds the
    // CPU/subrequest budget → error 1102), the finally block never runs. By
    // advancing last_spidered up front, a killed run still moves the cron on to
    // the next domain instead of re-selecting the same poison domain forever.
    const env = createEnv();
    const events: string[] = [];

    const chainable = {
      bind: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}), first: vi.fn().mockResolvedValue(null) }),
      first: vi.fn().mockResolvedValue(null),
      run: vi.fn().mockResolvedValue({}),
    };

    let firstCall = true;
    (env.CRAWL_DB.prepare as ReturnType<typeof vi.fn>).mockImplementation((sql: string) => {
      if (firstCall) {
        firstCall = false;
        return { first: vi.fn().mockResolvedValue({ domain: 'big.com', sitemap_url: 'https://big.com/sitemap.xml' }) };
      }
      if (sql.includes('UPDATE domains SET last_spidered')) events.push('claim');
      return chainable;
    });

    (parseSitemap as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      events.push('parse');
      return ['https://big.com/recipes/a'];
    });
    (isRecipeUrl as ReturnType<typeof vi.fn>).mockReturnValue(true);

    await spider.fetch(new Request('http://localhost/trigger'), env);

    expect(events).toContain('claim');
    expect(events).toContain('parse');
    expect(events.indexOf('claim')).toBeLessThan(events.indexOf('parse'));
  });

  it('updates last_spidered even when db.batch throws', async () => {
    const env = createEnv();

    env.CRAWL_DB.prepare.mockReturnValueOnce({
      first: vi.fn().mockResolvedValue({ domain: 'flaky.com', sitemap_url: 'https://flaky.com/sitemap.xml' }),
    });
    env.CRAWL_DB.batch.mockRejectedValueOnce(new Error('D1 transient failure'));

    (parseSitemap as ReturnType<typeof vi.fn>).mockResolvedValue(['https://flaky.com/recipes/a']);
    (isRecipeUrl as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const response = await spider.fetch(new Request('http://localhost/trigger'), env);
    const body = await response.json() as { ok: boolean; domain: string | null; inserted: number; error?: string };

    expect(body.ok).toBe(true);
    expect(body.domain).toBe('flaky.com');
    expect(body.inserted).toBe(0);
    expect(body.error).toMatch(/D1 transient failure/);

    const prepareCalls = (env.CRAWL_DB.prepare as ReturnType<typeof vi.fn>).mock.calls.map(
      (c: unknown[]) => c[0] as string,
    );
    expect(prepareCalls.some((sql) => sql.includes('UPDATE domains SET last_spidered'))).toBe(true);
  });
});
