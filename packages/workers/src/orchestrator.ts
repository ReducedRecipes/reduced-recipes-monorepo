import type { Env } from '@rr/shared/env';
import type { CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

async function runScheduled(env: Env) {
    // 1. Pull due URLs — prioritise domains with high-priority URLs first,
    //    then fill remaining slots with random domains.
    const priorityDomains = await env.DB.prepare(`
      SELECT DISTINCT domain FROM crawl_queue
      WHERE status = 'pending' AND priority <= 3 AND next_crawl <= datetime('now')
      LIMIT 20
    `).all<{ domain: string }>();

    const randomDomains = await env.DB.prepare(
      'SELECT domain FROM domains WHERE active = 1 ORDER BY RANDOM() LIMIT 80',
    ).all<{ domain: string }>();

    // Merge and deduplicate
    const seen = new Set(priorityDomains.results.map((d) => d.domain));
    const domains = {
      results: [
        ...priorityDomains.results,
        ...randomDomains.results.filter((d) => !seen.has(d.domain)),
      ].slice(0, 100),
    };

    const due: { results: CrawlJob[] } = { results: [] };
    if (domains.results.length > 0) {
      // D1 batch limit is 100 statements — split into 2 batches if needed
      const domainChunks = chunk(domains.results, 50);
      for (const domainBatch of domainChunks) {
        const stmts = domainBatch.map((d) =>
          env.DB.prepare(`
            SELECT url, domain FROM crawl_queue
            WHERE status = 'pending' AND domain = ? AND next_crawl <= datetime('now')
            ORDER BY priority ASC, next_crawl ASC
            LIMIT 20
          `).bind(d.domain),
        );
        const results = await env.DB.batch(stmts);
        for (const r of results) {
          due.results.push(...(r.results as unknown as CrawlJob[]));
        }
      }
    }

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
