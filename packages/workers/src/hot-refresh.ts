import type { Env } from '@rr/shared/env';

const DEFAULT_DECAY_SECONDS = 90000;
const DEFAULT_EPOCH = 1704067200; // 2024-01-01T00:00:00Z

async function runHotRefresh(env: Env) {
  const decaySeconds = parseFloat(env.HOT_DECAY_SECONDS ?? String(DEFAULT_DECAY_SECONDS));
  const epoch = parseFloat(env.HOT_EPOCH ?? String(DEFAULT_EPOCH));

  try {
    await env.DB.prepare(`
      UPDATE recipes
      SET hot_score =
        LOG10(MAX(vote_count, 1)) +
        (CAST(strftime('%s', COALESCE(first_voted_at, extracted_at)) AS REAL) - ?) / ?
      WHERE vote_count > 0
    `).bind(epoch, decaySeconds).run();
  } catch (err) {
    console.warn('Hot score update failed (LOG10 may need newer compat date):', err);
  }

  // ── Pre-compute health stats and write to KV (avoids 15 aggregation queries per health request) ──
  if (env.CACHE_KV) {
    try {
      await precomputeHealthStats(env);
    } catch (err) {
      console.warn('Health stats precompute failed:', err);
    }
  }
}

async function precomputeHealthStats(env: Env) {
  const minVotesFeatured = parseInt(env.HOT_MIN_VOTES_FEATURED ?? '3', 10) || 3;
  const crawlDb = env.CRAWL_DB ?? env.DB;

  const [results, crawlResults, featuredRow] = await Promise.all([
    env.DB.batch([
      env.DB.prepare('SELECT COUNT(*) as total FROM recipes'),
      env.DB.prepare('SELECT COALESCE(SUM(words_removed), 0) as total FROM recipes'),
      env.DB.prepare('SELECT COALESCE(SUM(ads_detected), 0) as total FROM recipes'),
      env.DB.prepare('SELECT ROUND(AVG(total_time)) as total FROM recipes WHERE total_time IS NOT NULL AND total_time > 0'),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE total_time IS NOT NULL AND total_time <= 20"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE total_time IS NOT NULL AND total_time <= 30"),
      env.DB.prepare('SELECT COUNT(DISTINCT domain) as total FROM recipes'),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE original_language IS NOT NULL AND original_language != 'en'"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipes WHERE extracted_at > datetime('now', '-7 days')"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag = 'vegetarian'"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag = 'vegan'"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag IN ('one-pan','one pan','skillet','one-pot','one pot')"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag IN ('gluten-free','gluten free')"),
      env.DB.prepare("SELECT COUNT(*) as total FROM recipe_tags WHERE tag IN ('keto','low-carb','low carb')"),
      env.DB.prepare("SELECT COUNT(DISTINCT recipe_id) as total FROM recipe_tags WHERE tag = 'translated'"),
    ]),
    crawlDb.batch([
      crawlDb.prepare("SELECT COUNT(*) as total FROM crawl_queue WHERE status='pending'"),
      crawlDb.prepare("SELECT COUNT(*) as total FROM crawl_queue WHERE status='failed'"),
      crawlDb.prepare('SELECT COUNT(*) as total FROM domains WHERE active=1'),
    ]),
    env.DB.prepare('SELECT id, title FROM recipes WHERE vote_count >= ? ORDER BY hot_score DESC LIMIT 1')
      .bind(minVotesFeatured)
      .first<{ id: string; title: string }>(),
  ]);

  const getTotal = (r: D1Result | undefined): number =>
    ((r?.results?.[0] as Record<string, number> | undefined)?.total) ?? 0;

  const data = {
    ok: true,
    total_recipes: getTotal(results[0]),
    pending_crawls: getTotal(crawlResults[0]),
    failed_crawls: getTotal(crawlResults[1]),
    active_domains: getTotal(crawlResults[2]),
    total_words_removed: getTotal(results[1]),
    total_ads_removed: getTotal(results[2]),
    avg_cook_time: getTotal(results[3]),
    under_20_min: getTotal(results[4]),
    under_30_min: getTotal(results[5]),
    sources_count: getTotal(results[6]),
    translated_count: getTotal(results[7]),
    new_this_week: getTotal(results[8]),
    vegetarian: getTotal(results[9]),
    vegan: getTotal(results[10]),
    one_pan: getTotal(results[11]),
    gluten_free: getTotal(results[12]),
    keto: getTotal(results[13]),
    translated_recipes: getTotal(results[14]),
    featured_recipe_id: featuredRow?.id ?? null,
    featured_recipe_title: featuredRow?.title ?? null,
    precomputed_at: new Date().toISOString(),
  };

  await env.CACHE_KV.put('cache:health', JSON.stringify(data), { expirationTtl: 7200 }); // 2 hour TTL
  console.log('Health stats precomputed and cached');
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    return runHotRefresh(env);
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      try {
        await runHotRefresh(env);
        return new Response('OK — hot-refresh triggered');
      } catch (err) {
        return new Response(`Error: ${(err as Error).message}\n${(err as Error).stack}`, { status: 500 });
      }
    }
    return new Response('Not found', { status: 404 });
  },
};
