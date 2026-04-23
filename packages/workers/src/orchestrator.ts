import type { Env } from '@rr/shared/env';
import type { CrawlJob } from '@rr/shared';
import { chunk, chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

async function runScheduled(env: Env) {
    const db = env.CRAWL_DB ?? env.DB;

    // 1. Pull pending URLs — simple query, priority first
    const due = await db.prepare(`
      SELECT url, domain FROM crawl_queue
      WHERE status = 'pending' AND next_crawl <= datetime('now')
      ORDER BY priority ASC, next_crawl ASC
      LIMIT 100
    `).all<CrawlJob>();

    // 2. Reset stuck 'crawling' URLs older than 10 minutes
    await db.prepare(`
      UPDATE crawl_queue SET status = 'pending', next_crawl = datetime('now')
      WHERE status = 'crawling' AND next_crawl < datetime('now', '-10 minutes')
    `).run();

    console.log(`ORCHESTRATOR: ${due.results.length} URLs due`);

    // 2. Mark as in-flight + 3. Enqueue to crawl-jobs FIRST (before sitemap which can be slow)
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

    // 4. Sitemap ingest disabled temporarily — was causing orchestrator timeouts
    // TODO: move to a separate worker or queue
    // try {
    //   await ingestNextSitemap(env);
    // } catch (err) {
    //   console.error('SITEMAP: ingest failed', err);
    // }
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
  `).first<{ domain: string; sitemap_url: string | null }>();

  if (!domain) return;

  console.log(`SITEMAP: processing ${domain.domain} (sitemap: ${domain.sitemap_url ?? 'none'})`);

  // Auto-discover sitemap if missing
  let sitemapUrl = domain.sitemap_url;
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemap(domain.domain);
    if (sitemapUrl) {
      console.log(`SITEMAP: discovered ${sitemapUrl} for ${domain.domain}`);
      await db.prepare('UPDATE domains SET sitemap_url = ? WHERE domain = ?')
        .bind(sitemapUrl, domain.domain).run();
    } else {
      console.log(`SITEMAP: no sitemap found for ${domain.domain}, seeding homepage`);
      // No sitemap found — seed the homepage so the parser can discover links
      await db.prepare(`
        INSERT OR IGNORE INTO crawl_queue (url, domain, priority, status, next_crawl)
        VALUES (?, ?, 1, 'pending', datetime('now'))
      `).bind(`https://www.${domain.domain}/`, domain.domain).run();
      await db.prepare('UPDATE domains SET last_spidered = datetime(\'now\') WHERE domain = ?')
        .bind(domain.domain).run();
      return;
    }
  }

  const urls = await parseSitemap(sitemapUrl);
  const recipeUrls = urls.filter((u) => isRecipeUrl(u, domain.domain));
  console.log(`SITEMAP: ${domain.domain} — ${urls.length} URLs, ${recipeUrls.length} recipe URLs`);

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

/** Try common sitemap paths for a domain. Returns the first valid one or null. */
async function discoverSitemap(domain: string): Promise<string | null> {
  const candidates = [
    `https://www.${domain}/sitemap.xml`,
    `https://${domain}/sitemap.xml`,
    `https://www.${domain}/sitemap_index.xml`,
    `https://${domain}/sitemap_index.xml`,
    `https://www.${domain}/robots.txt`,
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
        redirect: 'follow',
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;

      // For robots.txt, extract Sitemap: directive
      if (url.endsWith('robots.txt')) {
        const text = await res.text();
        const match = text.match(/^Sitemap:\s*(.+)$/im);
        if (match) return match[1]!.trim();
        continue;
      }

      const text = await res.text();
      if (text.includes('<urlset') || text.includes('<sitemapindex')) {
        return url;
      }
    } catch {
      continue;
    }
  }

  return null;
}
