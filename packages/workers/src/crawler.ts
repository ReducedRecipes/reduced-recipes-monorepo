import type { Env } from '@rr/shared/env';
import type { CrawlJob, ParseJob } from '@rr/shared';
import { checkRobots } from '@rr/shared/robots';

export default {
  async queue(batch: MessageBatch<CrawlJob>, env: Env) {
    const crawlDb = env.CRAWL_DB ?? env.DB;
    for (const msg of batch.messages) {
      const { url, domain } = msg.body;

      try {
        // ── robots.txt ──────────────────────────────────────────
        const robotsAllowed = await checkRobots(url, domain, env);
        if (!robotsAllowed) {
          await updateCrawlStatus(crawlDb, url, 'skipped');
          msg.ack();
          continue;
        }
        // ── fetch ───────────────────────────────────────────────
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'ReducedRecipesBot/1.0 (+https://reducedrecipes.com/bot)',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(15_000),
          redirect: 'follow',
        });

        if (!response.ok) {
          console.warn(`CRAWLER: HTTP ${response.status} ${domain} ${url}`);
          throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
          await updateCrawlStatus(crawlDb, url, 'skipped');
          msg.ack();
          continue;
        }

        const html = await response.text();

        // ── store HTML in KV (queues have 128KB limit) ────────
        const htmlKey = `html:${encodeURIComponent(url)}`;
        await env.CACHE_KV.put(htmlKey, html, { expirationTtl: 86400 });

        // ── enqueue for parsing ─────────────────────────────────
        await env.PARSE_QUEUE.send(
          { url, domain, htmlKey } satisfies ParseJob,
          { contentType: 'json' },
        );
        await updateCrawlStatus(crawlDb, url, 'done');
        msg.ack();
      } catch (err) {
        const error = err as Error;
        if (!error.message.startsWith('HTTP ')) {
          console.error(`CRAWLER: ${domain} threw ${error.message} ${url}`);
        }

        try {
          await crawlDb.prepare(`
            UPDATE crawl_queue
            SET
              fail_count = fail_count + 1,
              status = CASE
                WHEN fail_count + 1 >= 5 THEN 'failed'
                ELSE 'pending'
              END,
              next_crawl = datetime('now', '+' || ((1 << (fail_count + 1)) * 60) || ' seconds'),
              last_crawled = datetime('now')
            WHERE url = ?
          `).bind(url).run();
        } catch {
          // D1 update failed (e.g. context timed out) — still retry the message
        }

        if (msg.attempts < 3) {
          msg.retry({ delaySeconds: Math.pow(2, msg.attempts) * 30 });
        } else {
          msg.ack(); // permanent failure → DLQ
        }
      }
    }
  },
};

async function updateCrawlStatus(
  db: D1Database,
  url: string,
  status: string,
): Promise<void> {
  await db.prepare(
    "UPDATE crawl_queue SET status = ?, last_crawled = datetime('now') WHERE url = ?",
  ).bind(status, url).run();
}

