interface Env {
  DB: D1Database;          // recipes DB
  USERS_DB: D1Database;    // users DB (recipe_votes lives here)
}

interface SaveAgg { recipe_id: string; saves: number }
interface SearchAgg { recipe_id: string; hits: number }

const WINDOW_DAYS = 7;

async function run(env: Env): Promise<{ recipes: number }> {
  const sinceDate = new Date(Date.now() - WINDOW_DAYS * 86400_000).toISOString().slice(0, 10);

  // 1. Saves per recipe (users DB).
  // recipe_votes.created_at is TEXT default datetime('now') ("YYYY-MM-DD HH:MM:SS").
  // datetime('now', '-7 days') gives the cutoff in matching format; lexicographic compare works.
  const saves = await env.USERS_DB.prepare(`
    SELECT recipe_id, COUNT(*) AS saves
    FROM recipe_votes
    WHERE action = 'heart' AND created_at >= datetime('now', '-7 days')
    GROUP BY recipe_id
  `).all<SaveAgg>();

  // 2. Search hits per recipe (recipes DB).
  const searches = await env.DB.prepare(`
    SELECT recipe_id, SUM(hits) AS hits
    FROM social_search_hits
    WHERE date >= ?
    GROUP BY recipe_id
  `).bind(sinceDate).all<SearchAgg>();

  // 3. Maps + p95 normalisation.
  const saveMap = new Map(saves.results.map((r) => [r.recipe_id, r.saves]));
  const searchMap = new Map(searches.results.map((r) => [r.recipe_id, r.hits]));
  const savesValues = saves.results.map((r) => r.saves).sort((a, b) => a - b);
  const searchValues = searches.results.map((r) => r.hits).sort((a, b) => a - b);
  const saveP95 = percentile(savesValues, 0.95) || 1;
  const searchP95 = percentile(searchValues, 0.95) || 1;

  const recipeIds = new Set<string>([...saveMap.keys(), ...searchMap.keys()]);

  const now = Date.now();
  const stmt = env.DB.prepare(`
    INSERT INTO social_recipe_signals
      (recipe_id, save_velocity_7d, search_volume_7d, raw_saves_7d, raw_searches_7d, computed_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(recipe_id) DO UPDATE SET
      save_velocity_7d = excluded.save_velocity_7d,
      search_volume_7d = excluded.search_volume_7d,
      raw_saves_7d     = excluded.raw_saves_7d,
      raw_searches_7d  = excluded.raw_searches_7d,
      computed_at      = excluded.computed_at
  `);

  const batch: D1PreparedStatement[] = [];
  for (const id of recipeIds) {
    const rawSaves = saveMap.get(id) ?? 0;
    const rawSearches = searchMap.get(id) ?? 0;
    batch.push(stmt.bind(
      id, clip01(rawSaves / saveP95), clip01(rawSearches / searchP95),
      rawSaves, rawSearches, now,
    ));
  }
  if (batch.length) await env.DB.batch(batch);

  console.log(`SOCIAL_SIGNALS_ROLLUP: refreshed ${recipeIds.size} recipes`);
  return { recipes: recipeIds.size };
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
}

function clip01(x: number): number {
  if (Number.isNaN(x) || !Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(run(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response(`Error: ${(err as Error).message}`, { status: 500 }); }
    }
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try { return Response.json(await run(env)); }
      catch (err) { return new Response(`Error: ${(err as Error).message}`, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
