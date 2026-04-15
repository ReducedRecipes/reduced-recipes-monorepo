import type { Env, CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';

export default {
  async scheduled(
    _event: ScheduledEvent,
    env: Env,
    _ctx: ExecutionContext,
  ) {
    console.log('[orchestrator] START');
    try {
      // 1. Dispatch pending URLs to crawler
      const due = await env.DB.prepare(`
        SELECT url, domain FROM crawl_queue
        WHERE status = 'pending' AND next_crawl <= datetime('now')
        ORDER BY priority ASC, next_crawl ASC
        LIMIT 500
      `).all<CrawlJob>();

      console.log(`[orchestrator] Found ${due.results.length} due URLs`);

      if (due.results.length) {
        for (const batch of chunk(due.results, 100)) {
          const stmts = batch.map((r) =>
            env.DB.prepare('UPDATE crawl_queue SET status = ? WHERE url = ?').bind('crawling', r.url),
          );
          await env.DB.batch(stmts);
        }
        for (const batch of chunk(due.results, 100)) {
          await env.CRAWL_QUEUE.sendBatch(
            batch.map((row) => ({
              body: row satisfies CrawlJob,
              contentType: 'json' as const,
            })),
          );
        }
        console.log(`[orchestrator] Enqueued ${due.results.length} to crawl-jobs`);
      }

      // 2. Ingest sitemaps — spider up to 3 domains per cycle
      await ingestSitemaps(env, 3);
      console.log('[orchestrator] DONE');
    } catch (err) {
      console.error('[orchestrator] ERROR', err instanceof Error ? err.message : String(err));
    }
  },
};

async function ingestSitemaps(env: Env, maxDomains: number) {
  const domains = await env.DB.prepare(`
    SELECT domain, sitemap_url FROM domains
    WHERE active = 1 AND (last_spidered IS NULL OR last_spidered < datetime('now', '-10 minutes'))
    ORDER BY last_spidered ASC NULLS FIRST
    LIMIT ?
  `).bind(maxDomains).all<{ domain: string; sitemap_url: string }>();

  for (const domain of domains.results) {
    if (!domain.sitemap_url) continue;
    try {
      const urls = await fetchSitemapAggressive(domain.sitemap_url);
      const newUrls = urls.slice(0, 2000);
      console.log(`[orchestrator] ${domain.domain}: found ${urls.length} URLs, queueing ${newUrls.length}`);

      const stmts = newUrls.map((url) =>
        env.DB.prepare(
          "INSERT OR IGNORE INTO crawl_queue (url, domain, status, next_crawl) VALUES (?, ?, 'pending', datetime('now'))",
        ).bind(url, domain.domain),
      );

      for (const c of chunks(stmts, 100)) {
        await env.DB.batch(c);
      }

      await env.DB.prepare(
        'UPDATE domains SET last_spidered = datetime(\'now\') WHERE domain = ?',
      ).bind(domain.domain).run();
    } catch (err) {
      console.error(`[orchestrator] sitemap error ${domain.domain}:`, err instanceof Error ? err.message : String(err));
    }
  }
}

async function fetchSitemapAggressive(sitemapUrl: string): Promise<string[]> {
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
      // Shuffle and fetch up to 10 child sitemaps
      const shuffled = childUrls.sort(() => Math.random() - 0.5);
      const allUrls: string[] = [];
      for (const childUrl of shuffled.slice(0, 10)) {
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
