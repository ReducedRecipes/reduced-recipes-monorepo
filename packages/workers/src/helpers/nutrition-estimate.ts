import type { RecipeDocument } from '@rr/shared';
import { TEXT_GEN_MODEL } from './ai-models';

/**
 * Estimate nutrition per serving from a recipe's ingredient list using Workers AI.
 * Returns null if estimation fails or ingredients are insufficient.
 */
export async function estimateNutrition(
  doc: RecipeDocument,
  ai: Ai,
): Promise<RecipeDocument['nutrition'] | null> {
  if (!doc.ingredients || doc.ingredients.length === 0) return null;

  const ingredientList = doc.ingredients.join('\n');
  const servings = doc.yields ?? 'unknown servings';

  const result = (await ai.run(TEXT_GEN_MODEL, {
    messages: [
      {
        role: 'system',
        content:
          'You are a nutrition estimator. Given a recipe\'s ingredients and serving size, estimate the nutrition PER SERVING. Respond ONLY with a JSON object: {"calories":N,"protein_g":N,"fat_g":N,"carbs_g":N,"fiber_g":N,"sodium_mg":N}. Use integers. If uncertain, give your best estimate. No explanation.',
      },
      {
        role: 'user',
        content: `Recipe: "${doc.title}"\nServings: ${servings}\nIngredients:\n${ingredientList}`,
      },
    ],
    max_tokens: 100,
  })) as { response?: string };

  if (!result?.response) return null;

  try {
    const match = result.response.match(/\{[^}]+\}/s);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    const toNum = (v: unknown): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : Math.round(n);
    };

    const calories = toNum(parsed.calories);
    if (calories === null) return null;

    return {
      calories,
      protein_g: toNum(parsed.protein_g),
      fat_g: toNum(parsed.fat_g),
      carbs_g: toNum(parsed.carbs_g),
      fiber_g: toNum(parsed.fiber_g),
      sodium_mg: toNum(parsed.sodium_mg),
      source: 'ai',
    };
  } catch {
    return null;
  }
}
