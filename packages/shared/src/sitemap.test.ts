import { describe, it, expect, vi, afterEach } from 'vitest';
import { parseSitemap, isRecipeUrl } from './sitemap';

describe('isRecipeUrl', () => {
  it('returns true for URLs with recipe path segments', () => {
    expect(isRecipeUrl('https://example.com/recipe/pasta', 'example.com')).toBe(true);
    expect(isRecipeUrl('https://example.com/recipes/soup', 'example.com')).toBe(true);
    expect(isRecipeUrl('https://example.com/cooking/tips', 'example.com')).toBe(true);
  });

  it('returns false for non-recipe URLs', () => {
    expect(isRecipeUrl('https://example.com/about', 'example.com')).toBe(false);
    expect(isRecipeUrl('https://example.com/contact', 'example.com')).toBe(false);
  });

  it('returns false for different domain', () => {
    expect(isRecipeUrl('https://other.com/recipe/pasta', 'example.com')).toBe(false);
  });

  it('returns false for invalid URL', () => {
    expect(isRecipeUrl('not-a-url', 'example.com')).toBe(false);
  });

  it('accepts subdomain of matching domain', () => {
    expect(isRecipeUrl('https://www.example.com/recipe/1', 'example.com')).toBe(true);
  });

  it('uses pattern override when provided (clean URLs match)', () => {
    const pattern = '^/[a-z0-9-]+/?$';
    expect(isRecipeUrl('https://example.com/aloo-paratha/', 'example.com', pattern)).toBe(true);
    expect(isRecipeUrl('https://example.com/aloo-paratha', 'example.com', pattern)).toBe(true);
  });

  it('pattern override rejects paths that do not match', () => {
    const pattern = '^/[a-z0-9-]+/?$';
    expect(isRecipeUrl('https://example.com/blog/foo/bar', 'example.com', pattern)).toBe(false);
    expect(isRecipeUrl('https://example.com/category/desserts/', 'example.com', pattern)).toBe(false);
  });

  it('domain check still applies under pattern override', () => {
    expect(isRecipeUrl('https://other.com/anything', 'example.com', '.*')).toBe(false);
  });

  it('bad regex falls back to default heuristic', () => {
    expect(isRecipeUrl('https://example.com/recipe/pasta', 'example.com', '[invalid(')).toBe(true);
    expect(isRecipeUrl('https://example.com/about', 'example.com', '[invalid(')).toBe(false);
  });

  it('null or empty pattern still uses default heuristic', () => {
    expect(isRecipeUrl('https://example.com/recipe/pasta', 'example.com', null)).toBe(true);
    expect(isRecipeUrl('https://example.com/recipe/pasta', 'example.com', '')).toBe(true);
  });
});

describe('parseSitemap', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extracts URLs from a regular sitemap XML', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/recipe/1</loc></url>
  <url><loc>https://example.com/recipe/2</loc></url>
</urlset>`;

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => xml,
    })));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls).toEqual([
      'https://example.com/recipe/1',
      'https://example.com/recipe/2',
    ]);
  });

  it('returns empty array on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 404,
    })));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls).toEqual([]);
  });

  it('returns empty array on fetch error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('Network error');
    }));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls).toEqual([]);
  });

  it('sorts urls newest-first by <lastmod>', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/recipe/old</loc><lastmod>2024-01-01</lastmod></url>
  <url><loc>https://example.com/recipe/newest</loc><lastmod>2026-05-10</lastmod></url>
  <url><loc>https://example.com/recipe/mid</loc><lastmod>2025-06-15</lastmod></url>
</urlset>`;

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      text: async () => xml,
    })));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls).toEqual([
      'https://example.com/recipe/newest',
      'https://example.com/recipe/mid',
      'https://example.com/recipe/old',
    ]);
  });

  it('puts entries without lastmod after dated entries', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/recipe/undated-a</loc></url>
  <url><loc>https://example.com/recipe/dated</loc><lastmod>2026-05-10</lastmod></url>
  <url><loc>https://example.com/recipe/undated-b</loc></url>
</urlset>`;

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => xml })));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls[0]).toBe('https://example.com/recipe/dated');
    expect(urls.slice(1).sort()).toEqual([
      'https://example.com/recipe/undated-a',
      'https://example.com/recipe/undated-b',
    ]);
  });

  it('recurses into sitemap index, newest child first', async () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex>
  <sitemap><loc>https://example.com/sitemap-old.xml</loc><lastmod>2024-01-01</lastmod></sitemap>
  <sitemap><loc>https://example.com/sitemap-new.xml</loc><lastmod>2026-05-10</lastmod></sitemap>
</sitemapindex>`;

    const newXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/recipe/from-new</loc></url>
</urlset>`;

    const oldXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset>
  <url><loc>https://example.com/recipe/from-old</loc></url>
</urlset>`;

    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      text: async () => {
        if (url.endsWith('sitemap-old.xml')) return oldXml;
        if (url.endsWith('sitemap-new.xml')) return newXml;
        return indexXml;
      },
    })));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls).toEqual([
      'https://example.com/recipe/from-new',
      'https://example.com/recipe/from-old',
    ]);
  });

  it('falls back to bare <loc> when no <url> wrapper present', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<bareloc>
  <loc>https://example.com/recipe/a</loc>
  <loc>https://example.com/recipe/b</loc>
</bareloc>`;

    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => xml })));

    const urls = await parseSitemap('https://example.com/sitemap.xml');
    expect(urls).toEqual([
      'https://example.com/recipe/a',
      'https://example.com/recipe/b',
    ]);
  });
});
