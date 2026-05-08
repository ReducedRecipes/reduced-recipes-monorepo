import type { Env } from '@rr/shared/env';
import type { CrawlJob } from '@rr/shared';
import { chunk } from '@rr/shared/utils';

async function runScheduled(env: Env) {
    const db = env.CRAWL_DB ?? env.DB;

    // 1. Pull pending URLs — skip URLs whose domain is inactive (e.g. blocked at the CDN).
    //    LEFT JOIN + COALESCE keeps orphan URLs (no row in domains) flowing.
    const due = await db.prepare(`
      SELECT q.url, q.domain FROM crawl_queue q
      LEFT JOIN domains d ON d.domain = q.domain
      WHERE q.status = 'pending'
        AND q.next_crawl <= datetime('now')
        AND COALESCE(d.active, 1) = 1
      ORDER BY q.priority ASC, q.next_crawl ASC
      LIMIT 500
    `).all<CrawlJob>();

    // 2. Reset stuck 'crawling' URLs older than 10 minutes
    await db.prepare(`
      UPDATE crawl_queue SET status = 'pending', next_crawl = datetime('now')
      WHERE status = 'crawling' AND next_crawl < datetime('now', '-10 minutes')
    `).run();

    console.log(`ORCHESTRATOR: ${due.results.length} URLs due`);

    // 3. Mark as in-flight + enqueue to crawl-jobs.
    //    Sitemap ingest lives in rr-spider (separate hourly worker) so this stays fast.
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
