/**
 * Recipe translation helper using Workers AI m2m100-1.2b model.
 *
 * Translates title, ingredients, and instructions from the source
 * language to English. Batches ingredients and instructions into
 * single AI calls (newline-separated) to minimise request count.
 */

import type { RecipeDocument } from '@rr/shared';

const NEWLINE_SEPARATOR = '\n';

/**
 * Translate a single text block via Workers AI m2m100.
 *
 * @returns Translated text, or the original if translation fails.
 */
async function translateText(
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
 * Translate a list of strings by joining them with newlines,
 * translating as a single block, and splitting back.
 *
 * Falls back to per-item translation if the bulk result doesn't
 * produce the expected number of lines.
 */
async function translateList(
  items: string[],
  sourceLang: string,
  ai: Ai,
): Promise<string[]> {
  if (items.length === 0) return items;

  const joined = items.join(NEWLINE_SEPARATOR);
  const translated = await translateText(joined, sourceLang, ai);
  const parts = translated.split(NEWLINE_SEPARATOR);

  // If bulk split matches, use it directly
  if (parts.length === items.length) {
    return parts.map((p) => p.trim());
  }

  // Fallback: translate each item individually
  const results: string[] = [];
  for (const item of items) {
    results.push(await translateText(item, sourceLang, ai));
  }
  return results;
}

/**
 * Translate a non-English recipe document to English.
 *
 * Translates `title`, `ingredients`, and `instructions`.
 * Sets `original_title` and `original_language` on the returned doc.
 *
 * If translation fails for any field, the original text is kept — the
 * recipe is never blocked by a translation failure.
 *
 * @param doc - Recipe document with `original_language` already set.
 * @param ai  - Cloudflare Workers AI binding.
 * @returns A new RecipeDocument with translated fields.
 */
export async function translateRecipe(
  doc: RecipeDocument,
  ai: Ai,
): Promise<RecipeDocument> {
  const lang = doc.original_language;
  if (!lang || lang === 'en') return doc;

  const translated = { ...doc };
  translated.original_title = doc.title;

  try {
    translated.title = await translateText(doc.title, lang, ai);
  } catch {
    // Keep original title on failure
  }

  try {
    translated.ingredients = await translateList(doc.ingredients, lang, ai);
  } catch {
    // Keep original ingredients on failure
  }

  try {
    translated.instructions = await translateList(doc.instructions, lang, ai);
  } catch {
    // Keep original instructions on failure
  }

  return translated;
}
