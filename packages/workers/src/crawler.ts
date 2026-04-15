import type { Env, CrawlJob, ParseJob } from '@rr/shared';
import { checkRobots } from '@rr/shared/robots';

export default {
  async queue(batch: MessageBatch<CrawlJob>, env: Env) {
    console.log(`[crawler] Processing batch of ${batch.messages.length} messages`);
    for (const msg of batch.messages) {
      const { url, domain } = msg.body;
      console.log(`[crawler] Processing ${url}`);

      try {
        // ── robots.txt ──────────────────────────────────────────
        const robotsAllowed = await checkRobots(url, domain, env);
        console.log(`[crawler] robots.txt for ${domain}: ${robotsAllowed}`);
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
          expirationTtl: Math.max(Math.ceil(delayMs / 1000) * 2, 60),
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

        // ── Truncate HTML to fit queue message limit (128KB) ──
        // Extract only ld+json blocks + a limited portion of HTML for link discovery
        const ldJsonBlocks: string[] = [];
        const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let scriptMatch;
        while ((scriptMatch = scriptRegex.exec(html)) !== null) {
          ldJsonBlocks.push(scriptMatch[0]);
        }

        // Keep ld+json + first 50KB of HTML for link discovery
        const trimmedHtml = ldJsonBlocks.join('\n') + '\n<!-- LINKS -->\n' + html.slice(0, 50_000);

        // ── enqueue for parsing ─────────────────────────────────
        await env.PARSE_QUEUE.send(
          { url, domain, html: trimmedHtml } satisfies ParseJob,
          { contentType: 'json' },
        );
        await updateCrawlStatus(env, url, 'done');
        console.log(`[crawler] SUCCESS ${url} (${html.length} bytes, trimmed to ${trimmedHtml.length})`);
        msg.ack();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[crawler] ERROR ${url}: ${message}`);

        try {
          await env.DB.prepare(
            "UPDATE crawl_queue SET fail_count = fail_count + 1, status = 'failed' WHERE url = ?",
          ).bind(url).run();
        } catch { /* best effort */ }

        // Always ack to prevent queue pause from repeated failures
        msg.ack();
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
