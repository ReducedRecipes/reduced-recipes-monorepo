/**
 * Recipe embedding helper for Cloudflare Vectorize + Workers AI.
 *
 * Builds a compact text representation of a recipe and generates
 * a 384-dimensional embedding using bge-small-en-v1.5.
 */

import type { RecipeDocument } from '@rr/shared';

const EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';

/**
 * Build the embedding text for a recipe.
 *
 * Format: "{title} | {cuisine} | {category} | {ingredient_1}, {ingredient_2}, ..."
 *
 * Ingredients are kept as-is (quantities included) to support
 * "what can I make with X" style queries.
 */
export function buildEmbeddingText(doc: RecipeDocument): string {
  const parts: string[] = [doc.title];
  parts.push(doc.cuisine ?? '');
  parts.push(doc.category ?? '');
  parts.push(doc.ingredients.join(', '));
  return parts.join(' | ');
}

/**
 * Generate an embedding vector for a recipe using Workers AI.
 *
 * Returns the 384-dimensional float array, or null if the model
 * returns an unexpected response shape.
 */
export async function embedRecipe(
  doc: RecipeDocument,
  ai: Ai,
): Promise<number[] | null> {
  const text = buildEmbeddingText(doc);
  const result = (await ai.run(EMBEDDING_MODEL, {
    text: [text],
  })) as { data?: number[][] };

  const vector = result?.data?.[0];
  if (!vector || vector.length === 0) return null;
  return vector;
}
