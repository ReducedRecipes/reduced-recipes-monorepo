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
});
