import type { Env } from '@rr/shared/env';
import { chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

const MAX_URLS_PER_RUN = 5000;

async function runSpider(env: Env, targetDomain?: string): Promise<{ domain: string | null; inserted: number }> {
  const db = env.CRAWL_DB ?? env.DB;

  const domain = targetDomain
    ? await db.prepare('SELECT domain, sitemap_url FROM domains WHERE domain = ? AND active = 1')
        .bind(targetDomain)
        .first<{ domain: string; sitemap_url: string | null }>()
    : await db.prepare(`
        SELECT domain, sitemap_url FROM domains
        WHERE active = 1 AND (last_spidered IS NULL OR last_spidered < datetime('now', '-7 days'))
        ORDER BY last_spidered ASC NULLS FIRST
        LIMIT 1
      `).first<{ domain: string; sitemap_url: string | null }>();

  if (!domain) {
    console.log('SPIDER: no domain due');
    return { domain: null, inserted: 0 };
  }

  console.log(`SPIDER: processing ${domain.domain} (sitemap: ${domain.sitemap_url ?? 'none'})`);

  let sitemapUrl = domain.sitemap_url;
  if (!sitemapUrl) {
    sitemapUrl = await discoverSitemap(domain.domain);
    if (sitemapUrl) {
      console.log(`SPIDER: discovered ${sitemapUrl} for ${domain.domain}`);
      await db.prepare('UPDATE domains SET sitemap_url = ? WHERE domain = ?')
        .bind(sitemapUrl, domain.domain).run();
    } else {
      console.log(`SPIDER: no sitemap for ${domain.domain}, seeding homepage`);
      await db.prepare(`
        INSERT OR IGNORE INTO crawl_queue (url, domain, priority, status, next_crawl)
        VALUES (?, ?, 1, 'pending', datetime('now'))
      `).bind(`https://www.${domain.domain}/`, domain.domain).run();
      await db.prepare("UPDATE domains SET last_spidered = datetime('now') WHERE domain = ?")
        .bind(domain.domain).run();
      return { domain: domain.domain, inserted: 1 };
    }
  }

  const urls = await parseSitemap(sitemapUrl);
  const recipeUrls = urls.filter((u) => isRecipeUrl(u, domain.domain)).slice(0, MAX_URLS_PER_RUN);
  console.log(`SPIDER: ${domain.domain} — ${urls.length} URLs, ${recipeUrls.length} recipe URLs (capped at ${MAX_URLS_PER_RUN})`);

  const stmts = recipeUrls.map((url) =>
    db.prepare(`
      INSERT OR IGNORE INTO crawl_queue (url, domain, status, next_crawl)
      VALUES (?, ?, 'pending', datetime('now'))
    `).bind(url, domain.domain),
  );

  for (const c of chunks(stmts, 100)) {
    await db.batch(c);
  }

  await db.prepare("UPDATE domains SET last_spidered = datetime('now') WHERE domain = ?")
    .bind(domain.domain).run();

  return { domain: domain.domain, inserted: recipeUrls.length };
}

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

export default {
  scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    return runSpider(env);
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      const targetDomain = url.searchParams.get('domain') ?? undefined;
      try {
        const result = await runSpider(env, targetDomain);
        return Response.json({ ok: true, ...result });
      } catch (err) {
        return new Response(`Error: ${(err as Error).message}\n${(err as Error).stack}`, { status: 500 });
      }
    }
    return new Response('Not found', { status: 404 });
  },
};
