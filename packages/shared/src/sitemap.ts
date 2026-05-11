/**
 * Path segments that indicate a URL is likely a recipe page on a generic
 * recipe site. Used as the default heuristic when a domain has no
 * `recipe_url_pattern` override.
 */
export const RECIPE_PATH_SEGMENTS = [
  '/recipe/', '/recipes/', '/dish/', '/cook/',
  '/food/', '/cooking/', '/meal/',
];

/**
 * Check if a URL is likely a recipe page on the given domain.
 *
 * If `pattern` is provided, it is treated as a regex matched against the URL
 * pathname. Bad regex falls back to the default path-segment heuristic.
 * If `pattern` is omitted (or null/empty), the default heuristic applies.
 */
export function isRecipeUrl(
  url: string,
  domain: string,
  pattern?: string | null,
): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== domain && !parsed.hostname.endsWith(`.${domain}`)) return false;

    if (pattern) {
      try {
        return new RegExp(pattern).test(parsed.pathname);
      } catch {
        // Bad regex on a domain; fall through to default heuristic rather than
        // failing the whole spider run.
      }
    }
    return RECIPE_PATH_SEGMENTS.some((seg) => parsed.pathname.includes(seg));
  } catch {
    return false;
  }
}

interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

function parseEntries(text: string, blockRegex: RegExp): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  let m: RegExpExecArray | null;
  while ((m = blockRegex.exec(text)) !== null) {
    const block = m[1] ?? '';
    const locMatch = /<loc>(.*?)<\/loc>/i.exec(block);
    const lastmodMatch = /<lastmod>(.*?)<\/lastmod>/i.exec(block);
    if (locMatch?.[1]) {
      entries.push({
        loc: locMatch[1].trim(),
        lastmod: lastmodMatch?.[1]?.trim() ?? null,
      });
    }
  }
  return entries;
}

function byLastmodDesc(a: SitemapEntry, b: SitemapEntry): number {
  if (a.lastmod === null && b.lastmod === null) return 0;
  if (a.lastmod === null) return 1;
  if (b.lastmod === null) return -1;
  return b.lastmod.localeCompare(a.lastmod);
}

/**
 * Fetch and parse a sitemap XML, returning all `<loc>` URLs in newest-first
 * order based on `<lastmod>` (entries without lastmod sort to the end).
 *
 * Handles both sitemap index files (recurses into child sitemaps, newest
 * child first) and regular sitemaps. Falls back to bare `<loc>` extraction
 * if the document doesn't use `<url>` or `<sitemap>` wrappers.
 *
 * Newest-first ordering matters for the spider's MAX_URLS_PER_RUN cap: if a
 * site has 50k URLs in document order (oldest first) and we slice the first
 * 5,000, we never reach the new content. Sorting by lastmod descending puts
 * fresh URLs at the head of the list.
 */
export async function parseSitemap(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];

    const text = await res.text();

    // Sitemap index? Parse <sitemap> blocks first.
    const indexEntries = parseEntries(text, /<sitemap>([\s\S]*?)<\/sitemap>/gi);
    if (indexEntries.length > 0) {
      indexEntries.sort(byLastmodDesc);
      const urls: string[] = [];
      for (const entry of indexEntries) {
        const childUrls = await parseSitemap(entry.loc);
        urls.push(...childUrls);
      }
      return urls;
    }

    // Regular sitemap: parse <url> blocks with optional <lastmod>.
    const urlEntries = parseEntries(text, /<url>([\s\S]*?)<\/url>/gi);
    if (urlEntries.length > 0) {
      urlEntries.sort(byLastmodDesc);
      return urlEntries.map((e) => e.loc);
    }

    // Fallback: some non-standard sitemaps have bare <loc> tags without
    // <url> wrappers. Preserve document order in that case (no lastmod
    // signal to sort by).
    const fallback: string[] = [];
    const locRegex = /<loc>(.*?)<\/loc>/gi;
    let m: RegExpExecArray | null;
    while ((m = locRegex.exec(text)) !== null) {
      const loc = m[1];
      if (loc) fallback.push(loc.trim());
    }
    return fallback;
  } catch {
    return [];
  }
}
