import type { Env } from '@rr/shared/env';
import type { ParseJob, ProjectionJob, RecipeDocument } from '@rr/shared';
import { extractSchemaOrg, normaliseRecipe } from '@rr/shared/extract';

export default {
  async queue(batch: MessageBatch<ParseJob>, env: Env) {
    for (const msg of batch.messages) {
      const { url, domain, html: inlineHtml, htmlKey } = msg.body;

      try {
        // ── Resolve HTML from KV or inline ────────────────────────
        const html = htmlKey
          ? await env.CACHE_KV.get(htmlKey)
          : inlineHtml;

        if (!html) {
          await updateCrawlStatus(env, url, 'failed');
          msg.ack();
          continue;
        }

        // ── Extract Schema.org ld+json ──────────────────────────────
        const schema = extractSchemaOrg(html);

        if (!schema) {
          await updateCrawlStatus(env, url, 'no_schema');
          msg.ack();
          continue;
        }

        // ── Normalise into RecipeDocument ───────────────────────────
        const doc: RecipeDocument = normaliseRecipe(schema, url);

        // ── Validate required fields ────────────────────────────────
        if (!doc.title || doc.ingredients.length === 0) {
          await updateCrawlStatus(env, url, 'no_schema');
          msg.ack();
          continue;
        }

        // ── Write full document to KV ───────────────────────────────
        await env.RECIPES_KV.put(
          `recipe:${doc.id}`,
          JSON.stringify(doc),
          { expirationTtl: 31_536_000 }, // 1 year
        );

        // ── Enqueue projection job ──────────────────────────────────
        await env.PROJECTION_QUEUE.send(
          { id: doc.id, doc } satisfies ProjectionJob,
          { contentType: 'json' },
        );

        // ── Discover recipe links (up to 50) ────────────────────────
        const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
        const seen = new Set<string>();
        let linkMatch;

        while ((linkMatch = linkRegex.exec(html)) !== null && seen.size < 50) {
          try {
            const href = new URL(linkMatch[1]!, url).href;
            const linkDomain = new URL(href).hostname.replace(/^www\./, '');

            if (linkDomain !== domain) continue;
            if (seen.has(href)) continue;
            seen.add(href);

            await env.DB.prepare(
              `INSERT OR IGNORE INTO crawl_queue (url, domain, priority, status)
               VALUES (?, ?, 8, 'pending')`,
            ).bind(href, domain).run();
          } catch {
            // Invalid URL — skip
          }
        }

        // ── Clean up HTML from KV ──────────────────────────────────
        if (htmlKey) await env.CACHE_KV.delete(htmlKey);

        // ── Mark crawl as done ──────────────────────────────────────
        await updateCrawlStatus(env, url, 'done');
        msg.ack();
      } catch {
        msg.retry();
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
