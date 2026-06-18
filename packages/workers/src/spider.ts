import type { Env } from '@rr/shared/env';
import { chunks } from '@rr/shared/utils';
import { parseSitemap, isRecipeUrl } from '@rr/shared/sitemap';

// Wall-clock budget for the URL-insert loop. We used to hard-cap at 5000 URLs
// per run, which prevented us from ever fully ingesting large catalogues (some
// recipe sites have 50k+ entries). With newest-first sitemap sorting we get
// fresh content either way, but the cap left the long tail of older recipes
// uncrawled forever.
//
// Instead, walk the whole filtered sitemap and rely on a wall-clock budget to
// stop before the Worker is killed. INSERT OR IGNORE makes each run idempotent,
// so the next cron tick on the same domain just picks up where this one left
// off.
const URL_INSERT_BUDGET_MS = 50_000;

async function runSpider(
  env: Env,
  targetDomain?: string,
): Promise<{ domain: string | null; inserted: number; error?: string; truncated?: boolean; total?: number }> {
  const db = env.CRAWL_DB ?? env.DB;

  const domain = targetDomain
    ? await db.prepare('SELECT domain, sitemap_url, recipe_url_pattern FROM domains WHERE domain = ? AND active = 1')
        .bind(targetDomain)
        .first<{ domain: string; sitemap_url: string | null; recipe_url_pattern: string | null }>()
    : await db.prepare(`
        SELECT domain, sitemap_url, recipe_url_pattern FROM domains
        WHERE active = 1 AND (last_spidered IS NULL OR last_spidered < datetime('now', '-7 days'))
        ORDER BY last_spidered ASC NULLS FIRST
        LIMIT 1
      `).first<{ domain: string; sitemap_url: string | null; recipe_url_pattern: string | null }>();

  if (!domain) {
    console.log('SPIDER: no domain due');
    return { domain: null, inserted: 0 };
  }

  console.log(`SPIDER: processing ${domain.domain} (sitemap: ${domain.sitemap_url ?? 'none'})`);

  // Claim the domain up front: advance last_spidered BEFORE the expensive parse.
  // If the Worker is killed mid-parse (an oversized sitemap exceeding the
  // CPU/subrequest budget → error 1102), no post-parse bookkeeping runs — not
  // even a finally block, because the isolate is terminated rather than throwing.
  // Claiming here guarantees the cron advances to the next domain instead of
  // re-selecting the same poison domain on every tick (which previously stalled
  // URL discovery entirely). parseSitemap is independently bounded so it should
  // not hit the limit, but this makes a stall structurally impossible.
  await db.prepare("UPDATE domains SET last_spidered = datetime('now') WHERE domain = ?")
    .bind(domain.domain).run();

  try {
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
        return { domain: domain.domain, inserted: 1 };
      }
    }

    const urls = await parseSitemap(sitemapUrl);
    const recipeUrls = urls.filter((u) => isRecipeUrl(u, domain.domain, domain.recipe_url_pattern));
    console.log(`SPIDER: ${domain.domain} — ${urls.length} URLs, ${recipeUrls.length} recipe URLs (pattern=${domain.recipe_url_pattern ?? 'default'})`);

    const stmts = recipeUrls.map((url) =>
      db.prepare(`
        INSERT OR IGNORE INTO crawl_queue (url, domain, status, next_crawl)
        VALUES (?, ?, 'pending', datetime('now'))
      `).bind(url, domain.domain),
    );

    const startedAt = Date.now();
    let queued = 0;
    let truncated = false;
    for (const c of chunks(stmts, 100)) {
      if (Date.now() - startedAt > URL_INSERT_BUDGET_MS) {
        truncated = true;
        console.log(`SPIDER: ${domain.domain} hit ${URL_INSERT_BUDGET_MS}ms budget at ${queued}/${recipeUrls.length}, deferring rest to next run`);
        break;
      }
      await db.batch(c);
      queued += c.length;
    }

    return { domain: domain.domain, inserted: queued, ...(truncated ? { truncated: true, total: recipeUrls.length } : {}) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`SPIDER: ${domain.domain} failed: ${message}`);
    return { domain: domain.domain, inserted: 0, error: message };
  }
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
