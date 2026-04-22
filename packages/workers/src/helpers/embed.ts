/**
 * Recipe embedding helper for Cloudflare Vectorize + Workers AI.
 *
 * Builds a compact text representation of a recipe and generates
 * a 768-dimensional embedding using EmbeddingGemma-300M.
 */

import type { RecipeDocument } from '@rr/shared';

const EMBEDDING_MODEL = '@cf/google/embeddinggemma-300m';

/**
 * Build the embedding text for a recipe.
 *
 * Format: "{title} | {cuisine} | {category} | {ingredients} | {nutrition}"
 *
 * Includes nutrition summary so semantic search can match queries like
 * "high protein meals", "low carb dinner", "low calorie snack".
 */
export function buildEmbeddingText(doc: RecipeDocument): string {
  const parts: string[] = [doc.title];
  parts.push(doc.cuisine ?? '');
  parts.push(doc.category ?? '');
  parts.push(doc.ingredients.join(', '));

  // Add nutrition context if available
  if (doc.nutrition) {
    const n = doc.nutrition;
    const nutritionParts: string[] = [];
    if (n.calories != null) nutritionParts.push(`${n.calories} calories`);
    if (n.protein_g != null) nutritionParts.push(`${n.protein_g}g protein`);
    if (n.fat_g != null) nutritionParts.push(`${n.fat_g}g fat`);
    if (n.carbs_g != null) nutritionParts.push(`${n.carbs_g}g carbs`);
    if (n.fiber_g != null) nutritionParts.push(`${n.fiber_g}g fiber`);
    if (nutritionParts.length > 0) {
      parts.push(nutritionParts.join(', '));
    }
  }

  return parts.join(' | ');
}

/**
 * Generate an embedding vector for a recipe using Workers AI.
 *
 * Returns the 768-dimensional float array, or null if the model
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
