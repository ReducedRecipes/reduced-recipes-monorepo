// Prompt builders + per-cuisine negation table for the social-image-gen Worker.
// See spec/social.md §22.

const HERO_BASE = (recipeTitle: string) =>
  `overhead photograph of ${recipeTitle}, vibrant colours, soft natural daylight, rustic wooden surface, shallow depth of field, food photography, 35mm lens, no text overlay, no watermark`;

const FINISHED_BASE = (recipeTitle: string) =>
  `three-quarter angle photograph of finished ${recipeTitle} plated, garnished, warm cinematic light, casual rustic styling, food photography, no text, no watermark`;

const INGREDIENT_BASE = (ingredient: string) =>
  `top-down studio photograph of ${ingredient} on a plain off-white surface, soft daylight, isolated, food photography, no text, no shadows`;

const STEP_BASE = (action: string) =>
  `overhead photograph of ${action} in a home kitchen, soft daylight, food photography, no faces visible, no text`;

// Per-cuisine negation rules. Surfaces failure modes from Spike B.
// Keys are matched against `${cuisine.toLowerCase()} ${title.toLowerCase()}`
// via String.prototype.includes — keep them lowercase substrings.
const CUISINE_NEGATIONS: Record<string, string> = {
  'italian carbonara':       'no tomato sauce, no red sauce, no cream, only egg and cheese coating the pasta',
  'french sauce':            'no powdered cheese, no orange tint',
  'japanese ramen':          'no spaghetti, only ramen noodles, proper Japanese broth presentation',
  'thai curry':              'no Indian curry presentation, proper Thai bowl styling',
  'mexican taco al pastor':  'thin sliced pork, charred pineapple cubes visible',
};

export function heroPrompt(recipe: { title: string; cuisine: string | null }): string {
  return applyNegation(HERO_BASE(recipe.title), recipe);
}

export function finishedPrompt(recipe: { title: string; cuisine: string | null }): string {
  return applyNegation(FINISHED_BASE(recipe.title), recipe);
}

function applyNegation(base: string, recipe: { title: string; cuisine: string | null }): string {
  const key = `${recipe.cuisine?.toLowerCase() ?? ''} ${recipe.title.toLowerCase()}`.trim();
  for (const [k, neg] of Object.entries(CUISINE_NEGATIONS)) {
    if (key.includes(k)) return `${base}, ${neg}`;
  }
  return base;
}

export const ingredientPrompt = (ingredient: string) => INGREDIENT_BASE(ingredient);
export const stepPrompt = (action: string) => STEP_BASE(action);

export const PROMPT_VERSION = 'v1.0';
export const MODEL = '@cf/black-forest-labs/flux-1-schnell';
