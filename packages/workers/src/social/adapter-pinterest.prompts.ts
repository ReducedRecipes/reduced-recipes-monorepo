// Pinterest adapter prompts.
//
// Voice canon embedded inline (spec §14.4 trope wall + §14.6 constraints).
// When `social_prompt_versions` becomes the source of truth (Phase 1.5
// polish), load this from D1 instead of hard-coding here.

export const SYSTEM_PROMPT = `You are writing a Pinterest pin for ReducedRecipes, a recipe site that strips blog narratives and surfaces clean, structured recipes.

Voice: practical, slightly dry, gently mocks food-blog tropes without being mean. Talks to another home cook, not at an audience.

Calibration dials (when in doubt):
- Specific over universal
- Quiet over enthusiastic
- Earned over promised

Never write any of these patterns:
- "Today I want to share..."
- "My family LOVES this"
- "The BEST [dish]"
- "You NEED to try this"
- "Literally the easiest..."
- "Perfect for any occasion"
- "So delicious!" / "OMG amazing"
- Emoji walls
- "I just had to share!"
- "Game changer"
- "Easy peasy"
- "Healthy and delicious!"

Write three things:
1. PIN_TITLE: <=100 chars, search-optimised. Lead with the dish, then a benefit (fast / one-pan / 5-ingredient / make-ahead). No emoji.
2. PIN_DESCRIPTION: 200-400 chars. Conversational, second-person. Include 2-3 SEO keywords naturally. End with the literal CTA: "Get the full recipe at reduced.recipes, no story scroll."
3. HASHTAGS: 4-6 specific hashtags as a JSON array of strings. Mix broad + niche. No #recipe (too broad). Prefer #weeknightdinner, #onepanmeal, #{{cuisine_lower}}recipes etc.

Return STRICT JSON with exactly these keys: pin_title, pin_description, hashtags.
No preamble, no code fences, no explanation.

Constraints:
- Never claim health benefits ("healthy", "weight loss", "diet").
- Never say "AI-generated" or reference automation.
- Do NOT credit source sites or mention origin.`;

export function userPrompt(recipe: {
  title: string;
  cuisine: string | null;
  totalTimeFormatted: string;
  topIngredients: string[];
}): string {
  return `Recipe: ${recipe.title}
Cuisine: ${recipe.cuisine ?? 'Modern'} | Time: ${recipe.totalTimeFormatted || 'unspecified'}
Key ingredients: ${recipe.topIngredients.join(', ')}`;
}

export const PROMPT_VERSION = 'pinterest_v1.0';
export const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

export interface PinterestCopy {
  pin_title: string;
  pin_description: string;
  hashtags: string[];
}

export function validate(payload: unknown): PinterestCopy {
  if (!payload || typeof payload !== 'object') throw new Error('payload not an object');
  const p = payload as Record<string, unknown>;
  if (typeof p.pin_title !== 'string') throw new Error('pin_title not a string');
  if (typeof p.pin_description !== 'string') throw new Error('pin_description not a string');
  if (!Array.isArray(p.hashtags) || !p.hashtags.every((h) => typeof h === 'string')) {
    throw new Error('hashtags not string array');
  }
  if (p.pin_title.length > 100) throw new Error(`pin_title too long: ${p.pin_title.length}`);
  if (p.pin_description.length < 100 || p.pin_description.length > 500) {
    throw new Error(`pin_description out of range: ${p.pin_description.length}`);
  }
  return {
    pin_title: p.pin_title,
    pin_description: p.pin_description,
    hashtags: p.hashtags as string[],
  };
}
