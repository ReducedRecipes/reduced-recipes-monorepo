import type { Env } from '@rr/shared/env';
import { chunks } from '@rr/shared/utils';

interface RecipeEngagement {
  recipe_id: string;
  views_7d: number;
  bookmarks_7d: number;
}

interface RecipeAge {
  id: string;
  extracted_at: string;
}

interface HotRecipeKV {
  id: string;
  title: string;
  image_url: string | null;
  domain: string;
  cuisine: string | null;
  total_time: number | null;
  hot_score: number;
}

async function computeHotScores(env: Env) {
  const weightView = parseFloat(env.WEIGHT_VIEW || '1.0');
  const weightBookmark = parseFloat(env.WEIGHT_BOOKMARK || '3.0');
  const now = Date.now();

  // Step 1: Get 7-day view counts from USERS_DB
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();

  const viewCounts = await env.USERS_DB!.prepare(`
    SELECT recipe_id, COUNT(*) as cnt
    FROM recipe_views
    WHERE viewed_at >= ?
    GROUP BY recipe_id
  `).bind(sevenDaysAgo).all<{ recipe_id: string; cnt: number }>();

  // Step 2: Get 7-day bookmark counts from USERS_DB
  const bookmarkCounts = await env.USERS_DB!.prepare(`
    SELECT recipe_id, COUNT(*) as cnt
    FROM bookmarks
    WHERE created_at >= ?
    GROUP BY recipe_id
  `).bind(sevenDaysAgo).all<{ recipe_id: string; cnt: number }>();

  // Step 3: Merge engagement data
  const engagement = new Map<string, RecipeEngagement>();

  for (const row of viewCounts.results) {
    engagement.set(row.recipe_id, {
      recipe_id: row.recipe_id,
      views_7d: row.cnt,
      bookmarks_7d: 0,
    });
  }

  for (const row of bookmarkCounts.results) {
    const existing = engagement.get(row.recipe_id);
    if (existing) {
      existing.bookmarks_7d = row.cnt;
    } else {
      engagement.set(row.recipe_id, {
        recipe_id: row.recipe_id,
        views_7d: 0,
        bookmarks_7d: row.cnt,
      });
    }
  }

  if (engagement.size === 0) return;

  // Step 4: Get recipe ages from main DB
  const recipeIds = [...engagement.keys()];
  const ageMap = new Map<string, number>();

  for (const batch of chunks(recipeIds, 50)) {
    const placeholders = batch.map(() => '?').join(',');
    const results = await env.DB.prepare(
      `SELECT id, extracted_at FROM recipes WHERE id IN (${placeholders})`,
    ).bind(...batch).all<RecipeAge>();

    for (const row of results.results) {
      const extractedMs = new Date(row.extracted_at).getTime();
      const ageHours = (now - extractedMs) / (1000 * 60 * 60);
      ageMap.set(row.id, ageHours);
    }
  }

  // Step 5: Compute hot_score for each recipe
  // Formula: (views_7d * 1.0 + bookmarks_7d * 3.0) / (age_hours + 2) ^ 1.5
  const scores: { id: string; score: number }[] = [];

  for (const [recipeId, eng] of engagement) {
    const ageHours = ageMap.get(recipeId);
    if (ageHours === undefined) continue; // recipe not found in DB

    const numerator = eng.views_7d * weightView + eng.bookmarks_7d * weightBookmark;
    const denominator = Math.pow(ageHours + 2, 1.5);
    const score = numerator / denominator;

    scores.push({ id: recipeId, score });
  }

  // Step 6: Batch-update hot_score in main DB
  const updateStmts = scores.map(({ id, score }) =>
    env.DB.prepare('UPDATE recipes SET hot_score = ? WHERE id = ?').bind(score, id),
  );

  for (const batch of chunks(updateStmts, 100)) {
    await env.DB.batch(batch);
  }

  // Step 7: Reset scores for recipes with no recent engagement
  await env.DB.prepare(
    `UPDATE recipes SET hot_score = 0
     WHERE hot_score > 0 AND id NOT IN (${recipeIds.map(() => '?').join(',')})`,
  ).bind(...recipeIds).run();

  // Step 8: Write top 100 to KV for fast reads
  const top100 = await env.DB.prepare(`
    SELECT id, title, image_url, domain, cuisine, total_time, hot_score
    FROM recipes
    WHERE hot_score > 0
    ORDER BY hot_score DESC
    LIMIT 100
  `).all<HotRecipeKV>();

  await env.RECIPES_KV.put(
    'hot:top100',
    JSON.stringify({
      items: top100.results,
      updated_at: new Date(now).toISOString(),
    }),
    { expirationTtl: 3600 },
  );
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    await computeHotScores(env);
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      try {
        await computeHotScores(env);
        return new Response('OK — hot ranking recomputed');
      } catch (err) {
        return new Response(
          `Error: ${(err as Error).message}\n${(err as Error).stack}`,
          { status: 500 },
        );
      }
    }
    return new Response('Not found', { status: 404 });
  },
};
