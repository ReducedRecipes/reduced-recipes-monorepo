/**
 * Workers AI dietary inference helper.
 *
 * Two-pass approach:
 * 1. Rule-based keyword scan of recipe title, ingredients, and keywords/tags.
 * 2. AI fallback for restrictions not confidently determined by rules.
 */

import type { RecipeDocument } from '@rr/shared';
import {
  DIETARY_FLAGS,
  type DietaryRestriction,
  restrictionsToMask,
} from '@rr/shared/dietary';

const ALL_RESTRICTIONS = Object.keys(DIETARY_FLAGS) as DietaryRestriction[];

/** Keyword → set of restrictions it implies. */
const KEYWORD_MAP: Record<string, DietaryRestriction[]> = {
  vegan: ['vegan', 'vegetarian', 'dairy-free', 'egg-free'],
  vegetarian: ['vegetarian'],
  'gluten-free': ['gluten-free'],
  'gluten free': ['gluten-free'],
  celiac: ['gluten-free'],
  coeliac: ['gluten-free'],
  'nut-free': ['nut-free'],
  'nut free': ['nut-free'],
  'no nuts': ['nut-free'],
  'nut allergy': ['nut-free'],
  keto: ['keto', 'low-carb'],
  ketogenic: ['keto', 'low-carb'],
  paleo: ['paleo'],
  halal: ['halal'],
  kosher: ['kosher'],
  'dairy-free': ['dairy-free'],
  'dairy free': ['dairy-free'],
  'egg-free': ['egg-free'],
  'egg free': ['egg-free'],
  'soy-free': ['soy-free'],
  'soy free': ['soy-free'],
  'shellfish-free': ['shellfish-free'],
  'shellfish free': ['shellfish-free'],
  'low-carb': ['low-carb'],
  'low carb': ['low-carb'],
  'low-sodium': ['low-sodium'],
  'low sodium': ['low-sodium'],
  'sugar-free': ['sugar-free'],
  'sugar free': ['sugar-free'],
  pescatarian: ['pescatarian', 'vegetarian'],
};

/**
 * Scan text fields for dietary keywords (case-insensitive).
 * Returns the set of matched restriction names.
 */
function ruleBasedScan(doc: RecipeDocument): Set<DietaryRestriction> {
  const matched = new Set<DietaryRestriction>();

  // Collect all searchable text
  const texts: string[] = [];
  if (doc.title) texts.push(doc.title);
  if (doc.ingredients) texts.push(...doc.ingredients);
  if (doc.keywords) texts.push(...doc.keywords);
  if (doc.tags) texts.push(...doc.tags);
  if (doc.category) texts.push(doc.category);

  const combined = texts.join(' ').toLowerCase();

  for (const [keyword, restrictions] of Object.entries(KEYWORD_MAP)) {
    if (combined.includes(keyword)) {
      for (const r of restrictions) {
        matched.add(r);
      }
    }
  }

  return matched;
}

/**
 * Build an AI prompt to classify dietary restrictions for a recipe.
 */
function buildAiPrompt(
  doc: RecipeDocument,
  alreadyDetected: DietaryRestriction[],
): { system: string; user: string } {
  const remaining = ALL_RESTRICTIONS.filter(
    (r) => !alreadyDetected.includes(r),
  );

  const system = `You are a dietary restriction classifier. Given a recipe's title and ingredients, determine which of the following dietary restrictions apply: ${remaining.join(', ')}.

Respond ONLY with a JSON array of restriction names that apply. Example: ["dairy-free","egg-free"]
If none apply, respond with an empty array: []`;

  const ingredientList = doc.ingredients?.join(', ') || 'unknown';
  const user = `Recipe: "${doc.title}"
Ingredients: ${ingredientList}`;

  return { system, user };
}

/**
 * Parse the AI response into restriction names.
 * Tolerant of minor formatting issues.
 */
function parseAiResponse(response: string): DietaryRestriction[] {
  try {
    // Try to extract JSON array from response
    const match = response.match(/\[.*\]/s);
    if (!match) return [];

    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item: unknown): item is DietaryRestriction =>
        typeof item === 'string' && item in DIETARY_FLAGS,
    );
  } catch {
    return [];
  }
}

/**
 * Infer dietary restriction bitmask for a recipe document.
 *
 * 1. Rule-based keyword scan of title, ingredients, keywords/tags.
 * 2. AI fallback for remaining restrictions (if AI binding available).
 * 3. If AI fails, returns rule-based result only.
 */
export async function inferDietaryBitmask(
  doc: RecipeDocument,
  ai: Ai,
): Promise<number> {
  // Pass 1: Rule-based scan
  const ruleMatched = ruleBasedScan(doc);

  // Pass 2: AI fallback for undetermined restrictions
  const alreadyDetected = [...ruleMatched];

  if (alreadyDetected.length < ALL_RESTRICTIONS.length) {
    try {
      const { system, user } = buildAiPrompt(doc, alreadyDetected);

      const result = (await ai.run('@cf/meta/llama-3-8b-instruct', {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      })) as { response?: string };

      if (result?.response) {
        const aiRestrictions = parseAiResponse(result.response);
        for (const r of aiRestrictions) {
          ruleMatched.add(r);
        }
      }
    } catch {
      // AI failure: return rule-based result only
    }
  }

  return restrictionsToMask([...ruleMatched]);
}

// Export internals for testing
export { ruleBasedScan, buildAiPrompt, parseAiResponse };
