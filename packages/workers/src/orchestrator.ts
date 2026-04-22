import type { Env } from '@rr/shared/env';
import type { CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

async function runScheduled(env: Env) {
    const db = env.CRAWL_DB ?? env.DB;
    // 1. Pull due URLs — prioritise domains with high-priority URLs first,
    //    then fill remaining slots with random domains.
    // Pick domains with pending URLs — spread evenly across all active domains
    const allDomains = await db.prepare(`
      SELECT domain, COUNT(*) as pending FROM crawl_queue
      WHERE status = 'pending' AND next_crawl <= datetime('now')
      GROUP BY domain
      HAVING pending > 0
      ORDER BY RANDOM()
      LIMIT 100
    `).all<{ domain: string; pending: number }>();

    // Take fewer URLs per domain (max 5) to spread load across more sites
    const due: { results: CrawlJob[] } = { results: [] };
    if (allDomains.results.length > 0) {
      const domainChunks = chunk(allDomains.results, 50);
      for (const domainBatch of domainChunks) {
        const stmts = domainBatch.map((d) =>
          db.prepare(`
            SELECT url, domain FROM crawl_queue
            WHERE status = 'pending' AND domain = ? AND next_crawl <= datetime('now')
            ORDER BY priority ASC, next_crawl ASC
            LIMIT 5
          `).bind(d.domain),
        );
        const results = await db.batch(stmts);
        for (const r of results) {
          due.results.push(...(r.results as unknown as CrawlJob[]));
        }
      }
    }

    // 3.5. Reset stuck 'crawling' URLs older than 10 minutes
    await db.prepare(`
      UPDATE crawl_queue SET status = 'pending', next_crawl = datetime('now')
      WHERE status = 'crawling' AND next_crawl < datetime('now', '-10 minutes')
    `).run();

    // 4. Ingest up to 3 sitemaps per run to speed up domain onboarding
    for (let i = 0; i < 3; i++) {
      await ingestNextSitemap(env);
    }

    if (!due.results.length) return;

    // 2. Mark as in-flight + 3. Enqueue to crawl-jobs — in batches of 50
    const batches = chunk(due.results, 50);
    for (const batch of batches) {
      const batchUrls = batch.map((r) => r.url);
      await db.prepare(
        `UPDATE crawl_queue SET status = 'crawling', next_crawl = datetime('now')
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
  const db = env.CRAWL_DB ?? env.DB;
  const domain = await db.prepare(`
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
    db.prepare(`
      INSERT OR IGNORE INTO crawl_queue (url, domain, status, next_crawl)
      VALUES (?, ?, 'pending', datetime('now'))
    `).bind(url, domain.domain),
  );

  // D1 batch max is 100
  for (const c of chunks(stmts, 100)) {
    await db.batch(c);
  }

  await db.prepare(
    `UPDATE domains SET last_spidered = datetime('now') WHERE domain = ?`,
  ).bind(domain.domain).run();
}
