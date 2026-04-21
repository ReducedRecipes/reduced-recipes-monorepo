/**
 * Recipe translation helper using Workers AI Llama 3.1 model.
 *
 * Uses Llama for all translation — m2m100 was tested but produces
 * poor results for culinary terms ("farina" → "meat", "soffritto" → "sufferer").
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
 * Cheap translation via m2m100 — good for short items like ingredients.
 */
async function translateCheap(
  text: string,
  sourceLang: string,
  ai: Ai,
): Promise<string> {
  if (!text.trim()) return text;
  const result = (await ai.run('@cf/meta/m2m100-1.2b', {
    text,
    source_lang: sourceLang,
    target_lang: 'en',
  })) as { translated_text?: string };
  return result?.translated_text ?? text;
}

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

  const isTitle = context === 'title';
  const maxTokens = isTitle ? 50 : 2048;
  const systemPrompt = isTitle
    ? `Translate this ${langName} recipe title to English. Output ONLY the translated title (a few words), nothing else. Keep well-known dish names (Tiramisu, Carbonara, Risotto, Focaccia, Panettone, Panna Cotta) in their original form.`
    : `You are a culinary translator. Translate ${langName} recipe ${context} to natural English. Keep well-known dish names in their original form. Keep quantities and units as-is. Remove any footnote reference numbers (standalone digits after ingredient names). Output ONLY the translation, no explanations.`;

  const result = (await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    max_tokens: maxTokens,
  })) as { response?: string };

  let translated = result?.response?.trim() ?? text;

  // Safety: if title translation is way longer than original, Llama hallucinated — keep original
  if (isTitle && (translated.length > text.length * 2.5 || translated.includes('\n'))) {
    console.warn(`Title hallucination detected: "${translated.slice(0, 80)}..." — keeping original`);
    return text;
  }

  // Strip footnote reference numbers (e.g. "onion 1, celery 2" → "onion, celery")
  if (context === 'cooking instruction') {
    translated = translated.replace(/\s+\d+\s*([,.\s])/g, '$1');
    translated = translated.replace(/\s+\d+\s*$/g, '');
  }

  return translated;
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

  // Translate ingredients with Llama (m2m100 mistranslates culinary terms like "farina" → "meat")
  try {
    const ingredientBlock = doc.ingredients.join('\n');
    const result = await translateWithLlama(
      ingredientBlock,
      lang,
      'ingredients list (one ingredient per line, keep quantities and units, keep the same number of lines)',
      ai,
    );
    const lines = result.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= doc.ingredients.length * 0.5) {
      translated.ingredients = lines;
    }
  } catch {
    // Keep original on failure
  }

  // Translate instructions with Llama (m2m100 tested but too inaccurate for cooking steps)
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
