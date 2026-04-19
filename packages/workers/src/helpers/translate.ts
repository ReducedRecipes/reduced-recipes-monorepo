/**
 * Recipe translation helper using Workers AI Llama 3.1 model.
 *
 * Uses an LLM instead of a pure translation model for better
 * handling of culinary terms, proper nouns, and recipe context.
 */

import type { RecipeDocument } from '@rr/shared';

const LANG_NAMES: Record<string, string> = {
  it: 'Italian', de: 'German', fr: 'French', es: 'Spanish',
  pt: 'Portuguese', nl: 'Dutch', pl: 'Polish', tr: 'Turkish',
  sv: 'Swedish', da: 'Danish', no: 'Norwegian', hu: 'Hungarian',
  cs: 'Czech', ro: 'Romanian', ja: 'Japanese', ko: 'Korean',
  zh: 'Chinese', ru: 'Russian', ar: 'Arabic', th: 'Thai',
  vi: 'Vietnamese', el: 'Greek', fi: 'Finnish', hr: 'Croatian',
};

/**
 * Translate text using Llama 3.1 with recipe-aware prompting.
 */
async function translateWithLlama(
  text: string,
  sourceLang: string,
  context: string,
  ai: Ai,
): Promise<string> {
  if (!text.trim()) return text;

  const langName = LANG_NAMES[sourceLang] ?? sourceLang;

  const result = (await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: `You are a culinary translator. Translate ${langName} recipe ${context} to natural English. Keep well-known dish names (like Tiramisu, Carbonara, Risotto, Focaccia) in their original form. Keep quantities and units as-is. Output ONLY the translation, no explanations.`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 2048,
  })) as { response?: string };

  return result?.response?.trim() ?? text;
}

/**
 * Translate a non-English recipe document to English.
 *
 * Uses Llama 3.1 for context-aware translation that handles
 * culinary terms, proper nouns, and recipe-specific language.
 */
export async function translateRecipe(
  doc: RecipeDocument,
  ai: Ai,
): Promise<RecipeDocument> {
  const lang = doc.original_language;
  if (!lang || lang === 'en') return doc;

  const translated = { ...doc };
  translated.original_title = doc.title;

  // Translate title
  try {
    translated.title = await translateWithLlama(doc.title, lang, 'title', ai);
  } catch {
    // Keep original on failure
  }

  // Translate ingredients as a batch
  try {
    const ingredientBlock = doc.ingredients.join('\n');
    const result = await translateWithLlama(
      ingredientBlock,
      lang,
      'ingredients (one per line, keep the same number of lines)',
      ai,
    );
    const lines = result.split('\n').map((l) => l.trim()).filter(Boolean);
    // Only use if we got a reasonable number of lines back
    if (lines.length >= doc.ingredients.length * 0.5) {
      translated.ingredients = lines;
    }
  } catch {
    // Keep original on failure
  }

  // Translate instructions one at a time (they can be long)
  try {
    const translatedSteps: string[] = [];
    for (const step of doc.instructions) {
      const result = await translateWithLlama(step, lang, 'cooking instruction', ai);
      translatedSteps.push(result);
    }
    translated.instructions = translatedSteps;
  } catch {
    // Keep original on failure
  }

  return translated;
}
