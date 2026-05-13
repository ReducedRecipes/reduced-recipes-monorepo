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
 * If the parser handed us mojibake (Windows-1251 bytes decoded as UTF-8 etc.),
 * the input is full of U+FFFD replacement characters. Llama can't translate
 * that — it just invents a plausible-sounding recipe instead. Refuse to call
 * the model in that case and surface the corruption so it can be re-crawled
 * later under the new charset-aware pipeline.
 */
export function looksLikeMojibake(text: string): boolean {
  if (!text) return false;
  const replacements = (text.match(/�/g) ?? []).length;
  return replacements / text.length > 0.2;
}

/**
 * Heuristics for catching Llama hallucinations in title responses. We've seen
 * it produce plausible English titles unrelated to the source when given
 * garbled input — and it leaks list/structure markers ("Ingredients:") when
 * it wanders into generating a full recipe.
 */
function looksLikeHallucinatedTitle(translated: string, original: string, maxRatio: number): boolean {
  if (translated.length > original.length * maxRatio) return true;
  if (/\r?\n/.test(translated)) return true;
  if (/(?:^|\W)(ingredients|instructions|servings|directions|steps|recipe)\s*[:.]/i.test(translated)) return true;
  return false;
}

/**
 * For ingredients/instructions, the same wandering generation appends extra
 * recipes after the translation ("Borscht.\n\nIngredients:\n- beets..."). Cap
 * the output length and bail out when structural markers appear in
 * single-step inputs.
 */
function looksLikeHallucinatedBody(translated: string, original: string, context: string): boolean {
  // Translation can legitimately expand (e.g. Russian or CJK to English) but
  // 3x of the original plus a 200-char floor is more than generous.
  if (translated.length > Math.max(original.length * 3, 200)) return true;
  // A single instruction step that comes back with "Ingredients:" or a full
  // bulleted list of ingredients is a hallucination.
  if (context === 'cooking instruction' && /(?:^|\n)(?:-\s|ingredients\s*:)/i.test(translated)) {
    return true;
  }
  return false;
}

async function translateWithLlama(
  text: string,
  sourceLang: string,
  context: string,
  ai: Ai,
): Promise<string> {
  if (!text.trim()) return text;
  if (looksLikeMojibake(text)) {
    console.warn(`TRANSLATE: skipping mojibake input (${context})`);
    return text;
  }

  const langName = LANG_NAMES[sourceLang] ?? sourceLang;

  const isTitle = context === 'title';
  const maxTokens = isTitle ? 50 : 2048;
  // Plain prompts with no brand-name examples. Earlier prompts listed dishes
  // like "Tiramisu, Carbonara, Risotto, Focaccia, Panettone, Panna Cotta" as
  // examples of names to preserve — Llama latched onto those names and
  // hallucinated entire fake recipes around them when given garbled input.
  const systemPrompt = isTitle
    ? `Translate this ${langName} recipe title to English. Output only the translated title, nothing else. Keep well-known dish names in their original form.`
    : `You are a culinary translator. Translate ${langName} recipe ${context} into natural English. Keep well-known dish names in their original form. Keep quantities and units as-is. Output only the translation. Do not add explanations, ingredient lists, or any extra recipes.`;

  const result = (await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: text },
    ],
    max_tokens: maxTokens,
  })) as { response?: string };

  let translated = result?.response?.trim() ?? text;

  // Non-Latin scripts (CJK, Korean, Arabic, Devanagari) are denser than the
  // Latin alphabet, so a translated title is allowed to grow more.
  const hasNonLatin = /[぀-鿿가-힯؀-ۿऀ-ॿ]/.test(text);
  const maxRatio = hasNonLatin ? 5 : 2.5;

  if (isTitle && looksLikeHallucinatedTitle(translated, text, maxRatio)) {
    console.warn(`TRANSLATE: title hallucination, keeping original ("${translated.slice(0, 80)}")`);
    return text;
  }

  if (!isTitle && looksLikeHallucinatedBody(translated, text, context)) {
    console.warn(`TRANSLATE: ${context} hallucination, keeping original (output ${translated.length} chars vs input ${text.length})`);
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

  // If the title is already mojibake, the whole document is corrupted; don't
  // call Llama on any field — it'll just invent content. Leave the document
  // untouched so a future re-crawl under the charset-aware pipeline can fix
  // it cleanly.
  if (looksLikeMojibake(doc.title)) {
    console.warn(`TRANSLATE: skipping mojibake document ${doc.id} (${doc.source_url})`);
    return doc;
  }

  const translated = { ...doc };
  translated.original_title = doc.title;

  // Translate title (retry once on failure)
  try {
    translated.title = await translateWithLlama(doc.title, lang, 'title', ai);
  } catch (err) {
    console.warn(`Title translation failed for ${doc.id}, retrying:`, err);
    try {
      translated.title = await translateWithLlama(doc.title, lang, 'title', ai);
    } catch {
      console.error(`Title translation failed twice for ${doc.id}, keeping original`);
    }
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
