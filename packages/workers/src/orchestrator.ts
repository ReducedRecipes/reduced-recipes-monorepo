import type { Env, CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';
import { isRecipeUrl } from '@rr/shared/sitemap';

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    // 1. Pull due URLs, prioritised
    const due = await env.DB.prepare(`
      SELECT url, domain FROM crawl_queue
      WHERE status = 'pending' AND next_crawl <= datetime('now')
      ORDER BY priority ASC, next_crawl ASC
      LIMIT 500
    `).all<CrawlJob>();

    // 4. Always ingest sitemaps, even when queue is empty
    await ingestNextSitemap(env);

    if (!due.results.length) return;

    // 2. Mark as in-flight
    const urls = due.results.map((r) => r.url);
    await env.DB.prepare(
      `UPDATE crawl_queue SET status = 'crawling'
       WHERE url IN (${urls.map(() => '?').join(',')})`,
    ).bind(...urls).run();

    // 3. Enqueue to crawl-jobs in batches of 100
    const batches = chunk(due.results, 100);
    for (const batch of batches) {
      await env.CRAWL_QUEUE.sendBatch(
        batch.map((row) => ({
          body: row satisfies CrawlJob,
          contentType: 'json' as const,
        })),
      );
    }

  },
};

/**
 * Fetch a sitemap without deep recursion to stay within Workers CPU limits.
 * If it's a sitemap index, fetch only the first 3 child sitemaps.
 */
async function fetchSitemapShallow(sitemapUrl: string): Promise<string[]> {
  try {
    const res = await fetch(sitemapUrl, {
      headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const text = await res.text();

    // Check if sitemap index
    const indexRegex = /<sitemap>\s*<loc>(.*?)<\/loc>/gi;
    const childUrls: string[] = [];
    let match;
    while ((match = indexRegex.exec(text)) !== null) {
      if (match[1]) childUrls.push(match[1].trim());
    }

    if (childUrls.length > 0) {
      // Fetch only first 3 child sitemaps to stay within CPU budget
      const allUrls: string[] = [];
      for (const childUrl of childUrls.slice(0, 3)) {
        try {
          const childRes = await fetch(childUrl, {
            headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
            signal: AbortSignal.timeout(10000),
          });
          if (!childRes.ok) continue;
          const childText = await childRes.text();
          const locRegex = /<loc>(.*?)<\/loc>/gi;
          let m;
          while ((m = locRegex.exec(childText)) !== null) {
            if (m[1]) allUrls.push(m[1].trim());
          }
        } catch { continue; }
      }
      return allUrls;
    }

    // Regular sitemap
    const locRegex = /<loc>(.*?)<\/loc>/gi;
    const urls: string[] = [];
    while ((match = locRegex.exec(text)) !== null) {
      if (match[1]) urls.push(match[1].trim());
    }
    return urls;
  } catch {
    return [];
  }
}

async function ingestNextSitemap(env: Env) {
  const domain = await env.DB.prepare(`
    SELECT domain, sitemap_url FROM domains
    WHERE active = 1 AND (last_spidered IS NULL OR last_spidered < datetime('now', '-7 days'))
    ORDER BY last_spidered ASC NULLS FIRST
    LIMIT 1
  `).first<{ domain: string; sitemap_url: string }>();

  if (!domain?.sitemap_url) return;

  // Shallow sitemap fetch — only index + first child to stay within CPU limits
  const urls = await fetchSitemapShallow(domain.sitemap_url);
  const recipeUrls = urls.filter((u) => isRecipeUrl(u, domain.domain)).slice(0, 500);

  // Upsert into crawl_queue — ignore existing
  const stmts = recipeUrls.map((url) =>
    env.DB.prepare(`
      INSERT OR IGNORE INTO crawl_queue (url, domain, status, next_crawl)
      VALUES (?, ?, 'pending', datetime('now'))
    `).bind(url, domain.domain),
  );

  // D1 batch max is 100
  for (const c of chunks(stmts, 100)) {
    await env.DB.batch(c);
  }

  await env.DB.prepare(
    `UPDATE domains SET last_spidered = datetime('now') WHERE domain = ?`,
  ).bind(domain.domain).run();
}
