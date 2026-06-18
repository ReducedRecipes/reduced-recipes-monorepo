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
 *
 * Bounded by `limits`: a large sitemap index recurses into every child
 * sequentially, which previously blew the Worker's CPU/subrequest budget and
 * got the isolate killed (error 1102) before it could finish. A killed isolate
 * skips the spider's `last_spidered` bookkeeping, so the cron kept re-picking
 * the same oversized domain and stalled URL discovery entirely. These caps make
 * the parse physically unable to exceed the Worker limits.
 */
export interface ParseSitemapLimits {
  /** Max child sitemaps to recurse into from an index, across the whole tree. */
  maxChildSitemaps?: number;
  /** Max total URLs to collect. */
  maxUrls?: number;
  /** Absolute `Date.now()` timestamp after which recursion stops. */
  deadline?: number;
}

const DEFAULT_MAX_CHILD_SITEMAPS = 50;
const DEFAULT_MAX_URLS = 20_000;
const DEFAULT_PARSE_BUDGET_MS = 20_000;

interface SitemapBudget {
  childrenRemaining: number;
  maxUrls: number;
  deadline: number;
  visited: Set<string>;
}

export async function parseSitemap(
  sitemapUrl: string,
  limits: ParseSitemapLimits = {},
): Promise<string[]> {
  const budget: SitemapBudget = {
    childrenRemaining: limits.maxChildSitemaps ?? DEFAULT_MAX_CHILD_SITEMAPS,
    maxUrls: limits.maxUrls ?? DEFAULT_MAX_URLS,
    deadline: limits.deadline ?? Date.now() + DEFAULT_PARSE_BUDGET_MS,
    visited: new Set(),
  };
  return parseSitemapWithin(sitemapUrl, budget);
}

async function parseSitemapWithin(sitemapUrl: string, budget: SitemapBudget): Promise<string[]> {
  // Cycle guard: self-referential or mutually-referential sitemap indexes would
  // otherwise recurse forever.
  if (budget.visited.has(sitemapUrl)) return [];
  budget.visited.add(sitemapUrl);

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
        if (urls.length >= budget.maxUrls) break;
        if (budget.childrenRemaining <= 0) break;
        if (Date.now() > budget.deadline) break;
        budget.childrenRemaining--;
        const childUrls = await parseSitemapWithin(entry.loc, budget);
        for (const u of childUrls) {
          if (urls.length >= budget.maxUrls) break;
          urls.push(u);
        }
      }
      return urls;
    }

    // Regular sitemap: parse <url> blocks with optional <lastmod>.
    const urlEntries = parseEntries(text, /<url>([\s\S]*?)<\/url>/gi);
    if (urlEntries.length > 0) {
      urlEntries.sort(byLastmodDesc);
      return urlEntries.slice(0, budget.maxUrls).map((e) => e.loc);
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
      if (fallback.length >= budget.maxUrls) break;
    }
    return fallback;
  } catch {
    return [];
  }
}
