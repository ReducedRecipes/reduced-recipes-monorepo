import type { Env, CrawlJob, ParseJob } from '@rr/shared';
import { checkRobots } from '@rr/shared/robots';

export default {
  async queue(batch: MessageBatch<CrawlJob>, env: Env) {
    for (const msg of batch.messages) {
      const { url, domain } = msg.body;

      try {
        // ── robots.txt ──────────────────────────────────────────
        const robotsAllowed = await checkRobots(url, domain, env);
        if (!robotsAllowed) {
          await updateCrawlStatus(env, url, 'skipped');
          msg.ack();
          continue;
        }

        // ── rate limit ──────────────────────────────────────────
        const domainConfig = await env.DB.prepare(
          'SELECT crawl_delay_ms FROM domains WHERE domain = ?',
        ).bind(domain).first<{ crawl_delay_ms: number }>();

        const delayMs = domainConfig?.crawl_delay_ms ?? 3000;
        const windowKey = `rl:${domain}:${Math.floor(Date.now() / delayMs)}`;
        const slot = await env.CACHE_KV.get(windowKey);

        if (slot !== null) {
          // Rate limited — requeue with delay
          msg.retry({ delaySeconds: Math.ceil(delayMs / 1000) + 1 });
          continue;
        }

        await env.CACHE_KV.put(windowKey, '1', {
          expirationTtl: Math.ceil(delayMs / 1000) * 2,
        });

        // ── fetch ───────────────────────────────────────────────
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'ReducedRecipesBot/1.0 (+https://reducedrecipes.com/bot)',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: AbortSignal.timeout(10_000),
          redirect: 'follow',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.includes('text/html')) {
          await updateCrawlStatus(env, url, 'skipped');
          msg.ack();
          continue;
        }

        const html = await response.text();

        // ── enqueue for parsing ─────────────────────────────────
        await env.PARSE_QUEUE.send(
          { url, domain, html } satisfies ParseJob,
          { contentType: 'json' },
        );
        await updateCrawlStatus(env, url, 'done');
        msg.ack();
      } catch (err) {
        const error = err as Error;
        const isTransient = isTransientError(error);

        await env.DB.prepare(`
          UPDATE crawl_queue
          SET
            fail_count = fail_count + 1,
            status = CASE
              WHEN fail_count + 1 >= 3 THEN 'failed'
              ELSE 'pending'
            END,
            next_crawl = datetime('now', '+' || (POWER(2, fail_count + 1) * 60) || ' seconds')
          WHERE url = ?
        `).bind(url).run();

        if (isTransient && msg.attempts < 3) {
          msg.retry({ delaySeconds: Math.pow(2, msg.attempts) * 30 });
        } else {
          msg.ack(); // DLQ handles permanent failures
        }
      }
    }
  },
};

async function updateCrawlStatus(
  env: Env,
  url: string,
  status: string,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE crawl_queue SET status = ? WHERE url = ?',
  ).bind(status, url).run();
}

function isTransientError(err: Error): boolean {
  const message = err.message.toLowerCase();
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnreset') ||
    message.includes('503') ||
    message.includes('502') ||
    message.includes('429')
  );
}
