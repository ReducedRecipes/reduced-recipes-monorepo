import type { Env } from '@rr/shared/env';
import type { ParseJob, ProjectionJob, RecipeDocument } from '@rr/shared';
import { extractSchemaOrg, normaliseRecipe } from '@rr/shared/extract';
import { detectLanguage } from './helpers/detect-language';

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

        // ── Detect source language ─────────────────────────────────
        const sourceLang = detectLanguage(html, doc.title, url);
        if (sourceLang) {
          doc.original_language = sourceLang;
        }

        // ── Calculate content reduction stats ─────────────────────
        doc.reduction = calculateReduction(html, doc);

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

        // Skip non-recipe URLs
        const JUNK_PATTERNS = [
          /\.(pdf|jpg|jpeg|png|gif|svg|webp|css|js|ico|xml|json|zip|mp4|mp3)$/i,
          /[#?]/,                           // fragments and query strings
          /\/(tag|category|author|page|feed|wp-json|wp-admin|wp-content|wp-includes|comment|login|register|cart|checkout|account)\//i,
          /\/(search|sitemap|rss|atom|print|share|embed)\b/i,
          /\/\d{4}\/\d{2}\/?$/,             // date archives like /2024/03/
        ];

        while ((linkMatch = linkRegex.exec(html)) !== null && seen.size < 50) {
          try {
            const href = new URL(linkMatch[1]!, url).href;
            const linkDomain = new URL(href).hostname.replace(/^www\./, '');

            if (linkDomain !== domain) continue;
            if (seen.has(href)) continue;

            // Filter junk URLs
            const path = new URL(href).pathname;
            if (JUNK_PATTERNS.some((p) => p.test(href) || p.test(path))) continue;

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

// Ad/tracking network patterns to detect
const AD_PATTERNS = [
  'googlesyndication', 'doubleclick', 'google-analytics', 'googletagmanager',
  'facebook.net/en_US/fbevents', 'connect.facebook', 'adsbygoogle',
  'amazon-adsystem', 'media.net', 'outbrain', 'taboola', 'criteo',
  'pubmatic', 'rubiconproject', 'openx', 'adnxs', 'casalemedia',
  'mediavine', 'adthrive', 'ezoic', 'raptive', 'gourmetads',
  'bidvertiser', 'infolinks', 'revcontent', 'mgid', 'adroll',
  'shareasale', 'commission-junction', 'skimlinks', 'viglink',
];

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function calculateReduction(html: string, doc: RecipeDocument): NonNullable<RecipeDocument['reduction']> {
  // Count visible text words on the page (strip all HTML tags)
  const visibleText = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const originalWords = countWords(visibleText);

  // Count recipe words (ingredients + instructions)
  const recipeText = [
    doc.title,
    ...doc.ingredients,
    ...doc.instructions,
  ].join(' ');
  const recipeWords = countWords(recipeText);

  const wordsRemoved = Math.max(0, originalWords - recipeWords);
  const bloatPercent = originalWords > 0
    ? Math.round((wordsRemoved / originalWords) * 100)
    : 0;

  // Count ad scripts
  const htmlLower = html.toLowerCase();
  const adsDetected = AD_PATTERNS.filter((p) => htmlLower.includes(p)).length;

  return {
    original_words: originalWords,
    recipe_words: recipeWords,
    words_removed: wordsRemoved,
    bloat_percent: bloatPercent,
    ads_detected: adsDetected,
  };
}

async function updateCrawlStatus(
  env: Env,
  url: string,
  status: string,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE crawl_queue SET status = ? WHERE url = ?',
  ).bind(status, url).run();
}
