/**
 * Ingredient extraction for the recipe ingredient index.
 *
 * Takes raw ingredient strings from a recipe and returns normalised
 * ingredient names suitable for the `recipe_ingredients` table.
 */
import { parseIngredient } from './ingredient-parser';

const STOP_WORDS = new Set([
  'of', 'a', 'an', 'the', 'and', 'or', 'to', 'for', 'with', 'in', 'on',
]);

const FORM_WORDS = new Set([
  'sprig', 'clove', 'head', 'bunch', 'can', 'jar', 'bottle', 'bag',
  'box', 'pack', 'package', 'piece', 'slice', 'stalk', 'stick', 'leaf',
  'strip', 'sheet', 'dash', 'pinch', 'handful', 'knob', 'splash',
]);

/**
 * Normalise an ingredient name for the search index.
 * Strips prep notes, form words, and stop words but preserves word order
 * so names remain human-readable (unlike smart-rollup which sorts).
 */
function normaliseForIndex(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Strip leading non-alpha (parser artifacts like "/ 3.5 lb ...")
  s = s.replace(/^[^a-z]+/, '');
  // Strip parenthetical notes
  s = s.replace(/\(+[^)]*\)+/g, '').trim();
  // Strip everything after a comma
  s = s.replace(/,.*$/, '').trim();
  // Strip Italian/recipe quantity phrases (q.b., as needed, to taste, etc.)
  s = s.replace(/\b(q\.?b\.?|as needed|to taste|taste|as desired|about|approx\.?|approximately)\b/gi, '').trim();
  // Strip measurement/serving descriptors
  s = s.replace(/\b(tablespoon|teaspoon|ounce|fluid ounce|ladle|cup|pound)\b/gi, '').trim();
  // Strip prep/descriptor words
  s = s.replace(
    /\b(roughly|finely|thinly|freshly|coarsely|diced|minced|chopped|sliced|crushed|grated|peeled|halved|quartered|cut|stripped|torn|slivered|julienned|boneless|skinless|frozen|dried|fresh|organic|large|medium|small|extra|optional|room temperature|at room temperature|warm|cold|hot|unsalted|salted|pure|raw|cooked|uncooked|packed|loosely|firmly|divided|plus more|more)\b/gi,
    '',
  ).trim();
  // Strip stray numbers and units
  s = s.replace(/\b\d+(\.\d+)?\s*/g, '').trim();
  s = s.replace(/\b(kg|g|lb|oz|ml|l|tsp|tbsp|cup|cups|x)\b/gi, '').trim();
  // Normalise hyphens to spaces for consistency (all-purpose → all purpose)
  s = s.replace(/-/g, ' ');
  // Singularise and filter stop/form words, preserve order
  const words = s
    .split(/\s+/)
    .map((w) => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w && !STOP_WORDS.has(w) && !FORM_WORDS.has(w));
  // Collapse whitespace
  return words.join(' ');
}

/**
 * Extract deduplicated, normalised ingredient names from raw ingredient strings.
 * Returns an array suitable for inserting into the `recipe_ingredients` table.
 */
export function extractIngredientNames(rawIngredients: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of rawIngredients) {
    if (!raw || !raw.trim()) continue;

    const parsed = parseIngredient(raw);
    const name = normaliseForIndex(parsed.name || raw);

    if (name && !seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }

  return result;
}
