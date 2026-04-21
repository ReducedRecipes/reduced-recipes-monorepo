import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import type { RecipeSummary, User } from '@rr/shared';

type AppBindings = { Bindings: Env; Variables: { userId?: string; user?: User } };

const searchSimilar = new Hono<AppBindings>();

// ── GET /api/v1/search/similar/:id ─────────────────────────────────────
searchSimilar.get('/api/v1/search/similar/:id', async (c) => {
  const id = c.req.param('id');
  const limit = Math.min(Math.max(parseInt(c.req.query('limit') ?? '8', 10), 1), 50);

  if (!c.env.VECTORIZE) {
    return c.json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Vector search is not available' } }, 503);
  }

  // Validate recipe exists
  const recipe = await c.env.DB.prepare('SELECT id FROM recipes WHERE id = ?')
    .bind(id)
    .first();
  if (!recipe) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'Recipe not found' } }, 404);
  }

  // Fetch the stored vector for this recipe
  const vectors = await c.env.VECTORIZE.getByIds([id]);
  if (!vectors || vectors.length === 0) {
    // Recipe exists but has no vector yet (not yet indexed)
    return c.json({ items: [] }, 200, {
      'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
    });
  }

  const recipeVector = vectors[0].values;

  // Query Vectorize for similar recipes (fetch one extra to account for excluding the source)
  const queryResult = await c.env.VECTORIZE.query(recipeVector, {
    topK: limit + 1,
    returnValues: false,
    returnMetadata: 'none',
  });

  const matches = (queryResult.matches ?? []).filter((m) => m.id !== id).slice(0, limit);

  if (matches.length === 0) {
    return c.json({ items: [] }, 200, {
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    });
  }

  const similarIds = matches.map((m) => m.id);

  // Batch-fetch recipe data from D1
  const placeholders = similarIds.map(() => '?').join(',');
  const recipesResult = await c.env.DB.prepare(
    `SELECT id, title, domain, image_url, total_time, cook_time, yields, cuisine, category
     FROM recipes WHERE id IN (${placeholders})`,
  ).bind(...similarIds).all();

  const recipeMap = new Map(
    (recipesResult.results ?? []).map((r) => [(r as Record<string, unknown>).id as string, r as Record<string, unknown>]),
  );

  // Batch-fetch tags
  const tagMap = new Map<string, string[]>();
  if (similarIds.length > 0) {
    const tagResult = await c.env.DB.prepare(
      `SELECT recipe_id, tag FROM recipe_tags WHERE recipe_id IN (${placeholders})`,
    ).bind(...similarIds).all();

    for (const row of tagResult.results ?? []) {
      const r = row as { recipe_id: string; tag: string };
      const existing = tagMap.get(r.recipe_id) ?? [];
      existing.push(r.tag);
      tagMap.set(r.recipe_id, existing);
    }
  }

  // Preserve similarity ranking order from Vectorize
  const items: RecipeSummary[] = [];
  for (const match of matches) {
    const row = recipeMap.get(match.id);
    if (!row) continue;
    items.push({
      id: row.id as string,
      title: row.title as string,
      domain: row.domain as string,
      image_url: (row.image_url as string) ?? null,
      total_time: (row.total_time as number) ?? null,
      cook_time: (row.cook_time as number) ?? null,
      yields: (row.yields as string) ?? null,
      cuisine: (row.cuisine as string) ?? null,
      category: (row.category as string) ?? null,
      tags: tagMap.get(match.id) ?? [],
    });
  }

  return c.json({ items }, 200, {
    'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
  });
});

export default searchSimilar;
