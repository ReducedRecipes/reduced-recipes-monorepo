import type { Env, ParseJob, ProjectionJob, RecipeDocument } from '@rr/shared';
import { extractSchemaOrg, normaliseRecipe } from '@rr/shared/extract';

export default {
  async queue(batch: MessageBatch<ParseJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processMessage(msg.body, env);
      } catch (err) {
        console.error('[parser] FATAL:', err instanceof Error ? err.message : String(err));
      }
      msg.ack();
    }
  },
};

async function processMessage(body: ParseJob, env: Env) {
  const { url, domain, html } = body;

  const schema = extractSchemaOrg(html);
  if (!schema) {
    await updateCrawlStatus(env, url, 'no_schema');
    return;
  }

  const doc: RecipeDocument = normaliseRecipe(schema, url);
  if (!doc.title || doc.ingredients.length === 0) {
    await updateCrawlStatus(env, url, 'no_schema');
    return;
  }

  // Write to KV
  await env.RECIPES_KV.put(
    `recipe:${doc.id}`,
    JSON.stringify(doc),
    { expirationTtl: 31_536_000 },
  );

  // Enqueue projection
  await env.PROJECTION_QUEUE.send(
    { id: doc.id, doc } satisfies ProjectionJob,
    { contentType: 'json' },
  );

  // Discover links (up to 50)
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi;
  const seen = new Set<string>();
  let match;
  while ((match = linkRegex.exec(html)) !== null && seen.size < 50) {
    try {
      const href = new URL(match[1]!, url).href;
      const linkDomain = new URL(href).hostname.replace(/^www\./, '');
      if (linkDomain !== domain || seen.has(href)) continue;
      seen.add(href);
      await env.DB.prepare(
        "INSERT OR IGNORE INTO crawl_queue (url, domain, priority, status) VALUES (?, ?, 8, 'pending')",
      ).bind(href, domain).run();
    } catch { /* invalid URL */ }
  }

  await updateCrawlStatus(env, url, 'done');
}

async function updateCrawlStatus(env: Env, url: string, status: string): Promise<void> {
  await env.DB.prepare('UPDATE crawl_queue SET status = ? WHERE url = ?').bind(status, url).run();
}
