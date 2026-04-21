import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { RecipeSummary, User } from '@rr/shared';

type AppBindings = { Bindings: Env; Variables: { userId?: string; user?: User } };

const ingredientSearch = new Hono<AppBindings>();

/**
 * Use Workers AI to expand each ingredient term with synonyms and related names.
 * Returns the original terms plus any AI-suggested expansions, deduplicated.
 * Falls back to the original terms if AI is unavailable or fails.
 */
async function expandIngredientsWithAI(
  terms: string[],
  ai: Ai,
): Promise<string[]> {
  try {
    const result = (await ai.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are a culinary ingredient synonym expander. Given a list of ingredient names, return a JSON object mapping each ingredient to an array of synonyms and closely related ingredient names (e.g. "beef" → ["beef", "ground beef", "minced beef", "steak", "chuck"]).
Respond ONLY with a JSON object. Example: {"chicken": ["chicken", "poultry", "hen", "chicken breast", "chicken thigh"]}
Include the original ingredient in each list. Keep lists concise (5 items max per ingredient).`,
        },
        {
          role: 'user',
          content: JSON.stringify(terms),
        },
      ],
    })) as { response?: string };

    if (result?.response) {
      const jsonMatch = result.response.match(/\{.*\}/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
        const expanded = new Set<string>(terms);
        for (const key of terms) {
          const synonyms = parsed[key];
          if (Array.isArray(synonyms)) {
            for (const s of synonyms) {
              if (typeof s === 'string' && s.trim()) {
                expanded.add(s.trim().toLowerCase());
              }
            }
          }
        }
        return [...expanded];
      }
    }
  } catch {
    // AI failure — fall back to original terms
  }
  return terms;
}

// ── GET /api/v1/search/by-ingredients ──────────────────────────────────
ingredientSearch.get('/api/v1/search/by-ingredients', async (c) => {
  const haveParam = c.req.query('have') ?? '';
  const excludeParam = c.req.query('exclude') ?? '';
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '24', 10), 1), 50);
  const offset = Math.max(parseInt(c.req.query('offset') ?? '0', 10), 0);
  const mode = c.req.query('mode') ?? 'exact';

  if (mode !== 'exact' && mode !== 'semantic') {
    return c.json({ error: { code: 'INVALID_INPUT', message: "mode must be 'exact' or 'semantic'" } }, 400);
  }

  const have = haveParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const exclude = excludeParam.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

  if (have.length === 0) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'at least one ingredient required in have' } }, 400);
  }

  // In semantic mode, expand the ingredient terms using AI synonyms
  const searchTerms =
    mode === 'semantic' && c.env.AI
      ? await expandIngredientsWithAI(have, c.env.AI)
      : have;

  // Build LIKE conditions for fuzzy ingredient matching
  // "mince" matches "beef mince", "mincemeat", etc.
  const haveConditions = searchTerms.map(() => 'ingredient LIKE ?').join(' OR ');
  const haveLikeParams = searchTerms.map((h) => `%${h}%`);

  let sql: string;
  let params: (string | number)[];

  if (exclude.length > 0) {
    const excludeConditions = exclude.map(() => 'ingredient LIKE ?').join(' OR ');
    const excludeLikeParams = exclude.map((e) => `%${e}%`);
    sql = `
      SELECT recipe_id, COUNT(DISTINCT ingredient) as match_count
      FROM recipe_ingredients
      WHERE (${haveConditions})
        AND recipe_id NOT IN (
          SELECT DISTINCT recipe_id FROM recipe_ingredients WHERE ${excludeConditions}
        )
      GROUP BY recipe_id
      ORDER BY match_count DESC
      LIMIT ? OFFSET ?
    `;
    params = [...haveLikeParams, ...excludeLikeParams, limit + 1, offset];
  } else {
    sql = `
      SELECT recipe_id, COUNT(DISTINCT ingredient) as match_count
      FROM recipe_ingredients
      WHERE ${haveConditions}
      GROUP BY recipe_id
      ORDER BY match_count DESC
      LIMIT ? OFFSET ?
    `;
    params = [...haveLikeParams, limit + 1, offset];
  }

  const ingredientResults = await c.env.DB.prepare(sql).bind(...params).all();
  const rows = (ingredientResults.results ?? []) as { recipe_id: string; match_count: number }[];
  const hasMore = rows.length > limit;
  if (hasMore) rows.pop();

  if (rows.length === 0) return c.json({ items: [], has_more: false });

  const ids = rows.map((r) => r.recipe_id);

  // Batch-fetch recipe data
  const idPlaceholders = ids.map(() => '?').join(',');
  const recipes = await c.env.DB.prepare(
    `SELECT id, title, domain, image_url, total_time, cook_time, yields, cuisine, category
     FROM recipes WHERE id IN (${idPlaceholders})`,
  ).bind(...ids).all();

  const recipeMap = new Map(
    (recipes.results ?? []).map((r) => [(r as Record<string, unknown>).id as string, r as Record<string, unknown>]),
  );

  // Batch-fetch all ingredients for matched recipes to compute missing list
  const allIngredients = await c.env.DB.prepare(
    `SELECT recipe_id, ingredient FROM recipe_ingredients WHERE recipe_id IN (${idPlaceholders})`,
  ).bind(...ids).all();

  const ingredientsByRecipe = new Map<string, string[]>();
  for (const row of allIngredients.results ?? []) {
    const r = row as { recipe_id: string; ingredient: string };
    const list = ingredientsByRecipe.get(r.recipe_id) ?? [];
    list.push(r.ingredient);
    ingredientsByRecipe.set(r.recipe_id, list);
  }

  // Use substring matching for "missing" computation — matches on original have terms
  const matchesAnyHave = (ingredient: string) =>
    have.some((h) => ingredient.includes(h));
  const items = [];

  // Preserve ranking order from the SQL query
  for (const row of rows) {
    const recipe = recipeMap.get(row.recipe_id);
    if (!recipe) continue;

    const recipeIngredients = ingredientsByRecipe.get(row.recipe_id) ?? [];
    const missing = recipeIngredients.filter((name) => !matchesAnyHave(name));
    const totalCount = recipeIngredients.length;

    items.push({
      id: recipe.id as string,
      title: recipe.title as string,
      domain: recipe.domain as string,
      image_url: (recipe.image_url as string) ?? null,
      total_time: (recipe.total_time as number) ?? null,
      cook_time: (recipe.cook_time as number) ?? null,
      yields: (recipe.yields as string) ?? null,
      cuisine: (recipe.cuisine as string) ?? null,
      category: (recipe.category as string) ?? null,
      match: {
        have: row.match_count as number,
        total: totalCount,
        missing,
      },
    });
  }

  // Sort by fewest missing ingredients, then most matched
  items.sort((a, b) => a.match.missing.length - b.match.missing.length || b.match.have - a.match.have);

  return c.json({ items, has_more: hasMore }, 200, {
    'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
  });
});

// ── GET /api/v1/ingredients/suggest ────────────────────────────────────
ingredientSearch.get('/api/v1/ingredients/suggest', async (c) => {
  const q = (c.req.query('q') ?? '').toLowerCase().trim();
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '10', 10), 1), 50);

  if (q.length < 1) {
    return c.json({ items: [] });
  }

  const result = await c.env.DB.prepare(
    'SELECT name, count FROM ingredients WHERE name LIKE ?1 AND count > 0 ORDER BY count DESC LIMIT ?2',
  ).bind(`${q}%`, limit).all();

  const items = (result.results ?? []).map((r) => ({
    name: (r as Record<string, unknown>).name as string,
    count: (r as Record<string, unknown>).count as number,
  }));

  c.header('Cache-Control', 'public, max-age=300, s-maxage=3600, stale-while-revalidate=3600');
  return c.json({ items });
});

export default ingredientSearch;
