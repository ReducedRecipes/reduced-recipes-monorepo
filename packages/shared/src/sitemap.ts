/**
 * Path segments that indicate a URL is likely a recipe page.
 */
export const RECIPE_PATH_SEGMENTS = [
  '/recipe/', '/recipes/', '/dish/', '/cook/',
  '/food/', '/cooking/', '/meal/',
];

/**
 * Check if a URL is likely a recipe page on the given domain.
 */
export function isRecipeUrl(url: string, domain: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== domain && !parsed.hostname.endsWith(`.${domain}`)) return false;
    return RECIPE_PATH_SEGMENTS.some(seg => parsed.pathname.includes(seg));
  } catch {
    return false;
  }
}

/**
 * Fetch and parse a sitemap XML, returning all <loc> URLs.
 * Handles both sitemap index files (recurses into child sitemaps)
 * and regular sitemaps.
 */
export async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];

    const text = await res.text();
    const urls: string[] = [];

    // Check if this is a sitemap index (contains <sitemap> elements)
    const sitemapIndexRegex = /<sitemap>\s*<loc>(.*?)<\/loc>/gi;
    const childSitemaps: string[] = [];
    let match;

    while ((match = sitemapIndexRegex.exec(text)) !== null) {
      const loc = match[1];
      if (loc) childSitemaps.push(loc.trim());
    }

    if (childSitemaps.length > 0) {
      // Sitemap index — recursively fetch child sitemaps
      for (const childUrl of childSitemaps) {
        const childUrls = await parseSitemap(childUrl);
        urls.push(...childUrls);
      }
      return urls;
    }

    // Regular sitemap — extract all <loc> URLs
    const locRegex = /<loc>(.*?)<\/loc>/gi;
    while ((match = locRegex.exec(text)) !== null) {
      const loc = match[1];
      if (loc) urls.push(loc.trim());
    }

    return urls;
  } catch {
    return [];
  }
}
