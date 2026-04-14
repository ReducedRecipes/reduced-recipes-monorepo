import type { Env, CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

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

    // 4. Hourly: ingest one pending sitemap
    await ingestNextSitemap(env);
  },
};

async function ingestNextSitemap(env: Env) {
  const domain = await env.DB.prepare(`
    SELECT domain, sitemap_url FROM domains
    WHERE active = 1 AND (last_spidered IS NULL OR last_spidered < datetime('now', '-7 days'))
    ORDER BY last_spidered ASC NULLS FIRST
    LIMIT 1
  `).first<{ domain: string; sitemap_url: string }>();

  if (!domain?.sitemap_url) return;

  const urls = await parseSitemap(domain.sitemap_url);
  const recipeUrls = urls.filter((u) => isRecipeUrl(u, domain.domain));

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
