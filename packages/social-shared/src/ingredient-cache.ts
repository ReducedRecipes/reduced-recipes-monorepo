import type { IngredientCacheRow } from './types';

const STOPWORDS = new Set([
  'cup', 'cups', 'tbsp', 'tsp', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons',
  'g', 'kg', 'ml', 'l', 'oz', 'lb', 'lbs', 'pound', 'pounds',
  'large', 'medium', 'small', 'fresh', 'dried', 'chopped', 'diced', 'minced',
  'sliced', 'crushed', 'whole', 'ground', 'finely', 'roughly',
  'a', 'an', 'the', 'of', 'to', 'taste', 'optional', 'pinch',
]);

const PLURAL_TO_SINGULAR: Record<string, string> = {
  tomatoes: 'tomato', potatoes: 'potato', onions: 'onion', carrots: 'carrot',
  cloves: 'clove', eggs: 'egg', lemons: 'lemon', limes: 'lime', apples: 'apple',
};

export function normaliseIngredientKey(raw: string): string {
  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .map((t) => PLURAL_TO_SINGULAR[t] ?? (t.endsWith('s') && t.length > 3 ? t.slice(0, -1) : t));
  return tokens.join(' ').trim();
}

export interface CacheEnv {
  DB: D1Database;
  RR_SOCIAL_CACHE: R2Bucket;
}

export async function lookupIngredientImage(
  env: CacheEnv,
  rawIngredient: string,
): Promise<IngredientCacheRow | null> {
  const key = normaliseIngredientKey(rawIngredient);
  if (!key) return null;
  const row = await env.DB
    .prepare(`SELECT * FROM social_ingredient_image_cache WHERE ingredient_key = ?`)
    .bind(key)
    .first<IngredientCacheRow>();
  return row ?? null;
}

export async function recordIngredientImage(
  env: CacheEnv,
  args: { ingredient: string; r2Key: string; bytes: number; promptVersion: string; model: string },
): Promise<void> {
  const key = normaliseIngredientKey(args.ingredient);
  if (!key) throw new Error(`Cannot normalise ingredient: ${args.ingredient}`);
  await env.DB.prepare(`
    INSERT INTO social_ingredient_image_cache
      (ingredient_key, r2_key, prompt_version, model, generated_at, bytes)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(ingredient_key) DO UPDATE SET
      r2_key = excluded.r2_key, prompt_version = excluded.prompt_version,
      model = excluded.model, generated_at = excluded.generated_at,
      bytes = excluded.bytes
  `).bind(key, args.r2Key, args.promptVersion, args.model, Date.now(), args.bytes).run();
}
