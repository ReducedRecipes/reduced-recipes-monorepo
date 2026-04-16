import type { Env, CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

async function runScheduled(env: Env) {
    // 1. Pull due URLs — spread evenly across domains (round-robin)
    const due = await env.DB.prepare(`
      WITH ranked AS (
        SELECT url, domain,
          ROW_NUMBER() OVER (PARTITION BY domain ORDER BY priority ASC, next_crawl ASC) AS rn
        FROM crawl_queue
        WHERE status = 'pending' AND next_crawl <= datetime('now')
      )
      SELECT url, domain FROM ranked
      WHERE rn <= 5
      ORDER BY rn, domain
      LIMIT 500
    `).all<CrawlJob>();

    // 4. Always ingest sitemaps, even when queue is empty
    await ingestNextSitemap(env);

    if (!due.results.length) return;

    // 2. Mark as in-flight + 3. Enqueue to crawl-jobs — in batches of 50
    const batches = chunk(due.results, 50);
    for (const batch of batches) {
      const batchUrls = batch.map((r) => r.url);
      await env.DB.prepare(
        `UPDATE crawl_queue SET status = 'crawling'
         WHERE url IN (${batchUrls.map(() => '?').join(',')})`,
      ).bind(...batchUrls).run();

      await env.CRAWL_QUEUE.sendBatch(
        batch.map((row) => ({
          body: row satisfies CrawlJob,
          contentType: 'json' as const,
        })),
      );
    }
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    return runScheduled(env);
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      try {
        await runScheduled(env);
        return new Response('OK — orchestrator triggered');
      } catch (err) {
        return new Response(`Error: ${(err as Error).message}\n${(err as Error).stack}`, { status: 500 });
      }
    }
    return new Response('Not found', { status: 404 });
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
