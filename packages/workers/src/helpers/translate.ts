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

  const result = (await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content: `You are a culinary translator. Translate ${langName} recipe ${context} to natural English. Keep well-known dish names (like Tiramisu, Carbonara, Risotto, Focaccia) in their original form. Keep quantities and units as-is. Remove any footnote reference numbers (like standalone digits that appear after ingredient names in instructions, e.g. "onion 1, celery 2" should become "onion, celery"). Output ONLY the translation, no explanations.`,
      },
      { role: 'user', content: text },
    ],
    max_tokens: 2048,
  })) as { response?: string };

  let translated = result?.response?.trim() ?? text;

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

  // Translate ingredients with cheap m2m100 (good enough for short items)
  try {
    const results: string[] = [];
    for (const item of doc.ingredients) {
      results.push(await translateCheap(item, lang, ai));
    }
    translated.ingredients = results;
  } catch {
    // Keep original on failure
  }

  // Translate all instructions in one call
  try {
    const numberedSteps = doc.instructions.map((s, i) => `[${i + 1}] ${s}`).join('\n\n');
    const result = await translateWithLlama(
      numberedSteps,
      lang,
      'cooking instructions (keep the [1], [2], etc. markers, translate everything else)',
      ai,
    );
    const steps = result.split(/\[(\d+)\]\s*/).filter(Boolean);
    const parsed: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const trimmed = steps[i]!.trim();
      if (trimmed && !/^\d+$/.test(trimmed)) {
        parsed.push(trimmed);
      }
    }
    if (parsed.length >= doc.instructions.length * 0.5) {
      translated.instructions = parsed;
    }
  } catch {
    // Keep original on failure
  }

  return translated;
}
