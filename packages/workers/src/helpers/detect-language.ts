/**
 * Language detection helper for recipe HTML pages.
 *
 * Extracts the language from the `<html lang="...">` attribute and
 * normalises it to an ISO 639-1 code. Returns `null` when the page
 * is in English or the language cannot be determined.
 */

/** Matches the lang attribute on the <html> element. */
const HTML_LANG_RE = /<html[^>]*\slang=["']([^"']+)["']/i;

/**
 * Detect the language of an HTML page.
 *
 * @param html - Raw HTML string
 * @returns ISO 639-1 language code (e.g. 'de', 'fr') or `null` when
 *          the language is English or cannot be detected.
 */
export function detectLanguage(html: string): string | null {
  const match = HTML_LANG_RE.exec(html);

  if (match?.[1]) {
    // Normalise: 'de-DE' → 'de', 'pt-BR' → 'pt'
    const lang = match[1].split('-')[0]!.toLowerCase().trim();

    // Treat English as the default — no translation needed
    if (lang === 'en' || lang === '') return null;

    return lang;
  }

  return null;
}
