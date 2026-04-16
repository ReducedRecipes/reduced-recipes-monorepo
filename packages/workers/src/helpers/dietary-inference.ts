/**
 * Dietary inference pipeline: rule-based keyword matching + Workers AI fallback.
 *
 * Scans recipe ingredients to determine which dietary restrictions the recipe satisfies,
 * returning a bitmask compatible with DIETARY_FLAGS from @rr/shared/dietary.
 */

import { DIETARY_FLAGS, type DietaryRestriction } from '@rr/shared/dietary';

// ── Exclusion keyword lists ─────────────────────────────────────────
// If ANY keyword matches an ingredient, that restriction is EXCLUDED.

const EXCLUSIONS: Record<string, string[]> = {
  vegan: [
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'bacon', 'ham',
    'turkey', 'lamb', 'meat', 'steak', 'milk', 'butter', 'cream', 'cheese',
    'egg', 'honey', 'yogurt', 'whey',
  ],
  vegetarian: [
    'chicken', 'beef', 'pork', 'fish', 'salmon', 'shrimp', 'bacon', 'ham',
    'turkey', 'lamb', 'meat', 'steak',
  ],
  'gluten-free': [
    'flour', 'bread', 'pasta', 'wheat', 'barley', 'rye', 'soy sauce', 'noodle',
  ],
  'dairy-free': [
    'milk', 'butter', 'cream', 'cheese', 'yogurt', 'whey', 'casein',
  ],
  'nut-free': [
    'almond', 'walnut', 'pecan', 'cashew', 'peanut', 'pistachio', 'hazelnut',
  ],
};

/** Restrictions that have rule-based keyword lists. */
const RULE_BASED_RESTRICTIONS = Object.keys(EXCLUSIONS) as DietaryRestriction[];

/** All restrictions tracked by the bitmask. */
const ALL_RESTRICTIONS = Object.keys(DIETARY_FLAGS) as DietaryRestriction[];

// ── Rule-based engine ───────────────────────────────────────────────

function ruleBasedInference(ingredients: string[]): { mask: number; resolved: number } {
  const joined = ingredients.map((i) => i.toLowerCase()).join(' ');

  // Start with all rule-based flags set (assume safe until proven otherwise)
  let mask = 0;
  for (const r of RULE_BASED_RESTRICTIONS) {
    mask |= DIETARY_FLAGS[r];
  }

  let resolved = 0;

  for (const restriction of RULE_BASED_RESTRICTIONS) {
    const keywords = EXCLUSIONS[restriction];
    const excluded = keywords.some((kw) => joined.includes(kw));
    if (excluded) {
      // Unset this flag — recipe does NOT satisfy this restriction
      mask &= ~DIETARY_FLAGS[restriction];
      resolved++;
    }
  }

  return { mask, resolved };
}

// ── Workers AI fallback ─────────────────────────────────────────────

const AI_RESTRICTIONS = ALL_RESTRICTIONS.filter(
  (r) => !RULE_BASED_RESTRICTIONS.includes(r),
);

async function aiInference(
  recipe: { title: string; ingredients: string[] },
  ai: { run: (model: string, input: { prompt: string }) => Promise<{ response: string }> },
): Promise<number> {
  const ingredientList = recipe.ingredients.join(', ');
  const categories = AI_RESTRICTIONS.join(', ');

  const prompt = `Given this recipe titled "${recipe.title}" with ingredients: ${ingredientList}.

For each dietary category below, respond with ONLY the category name followed by YES or NO on each line. No explanations.

Categories: ${categories}`;

  const result = await ai.run('@cf/meta/llama-3-8b-instruct', { prompt });
  const response = result.response.toLowerCase();

  let mask = 0;
  for (const r of AI_RESTRICTIONS) {
    // Look for "category: yes" or "category yes" patterns
    const pattern = new RegExp(`${r.replace('-', '[\\s-]')}[:\\s]+yes`, 'i');
    if (pattern.test(response)) {
      mask |= DIETARY_FLAGS[r];
    }
  }

  return mask;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Infer dietary bitmask for a recipe using rule-based matching
 * and optional Workers AI fallback for ambiguous cases.
 *
 * @param recipe - Recipe with title and ingredients list
 * @param ai - Optional Workers AI binding (skipped if undefined)
 * @returns Combined dietary bitmask
 */
export async function inferDietaryBitmask(
  recipe: { title: string; ingredients: string[] },
  ai?: { run: (model: string, input: { prompt: string }) => Promise<{ response: string }> },
): Promise<number> {
  const { mask: ruleMask, resolved } = ruleBasedInference(recipe.ingredients);

  // If AI binding is not provided, return rule-based result only
  if (!ai) {
    return ruleMask;
  }

  // If fewer than 3 restrictions were resolved by rules, use AI for remaining
  if (resolved < 3) {
    const aiMask = await aiInference(recipe, ai);
    return ruleMask | aiMask;
  }

  // Rules resolved enough — use AI only for non-rule-based restrictions
  const aiMask = await aiInference(recipe, ai);
  return ruleMask | aiMask;
}
