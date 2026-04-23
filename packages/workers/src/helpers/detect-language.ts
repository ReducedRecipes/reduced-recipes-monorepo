/**
 * Language detection helper for recipe HTML pages.
 *
 * Detection order:
 * 1. URL path prefix (e.g. /es/, /fr/, /de/)
 * 2. <html lang="..."> attribute
 * 3. Unicode script detection on title/content (catches Devanagari, CJK, etc.)
 *
 * Returns `null` when the page is English or language cannot be determined.
 */

const HTML_LANG_RE = /<html[^>]*\slang=["']([^"']+)["']/i;

/** Common URL path prefixes for language variants. */
const URL_LANG_PREFIXES: Record<string, string> = {
  es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', nl: 'nl',
  pl: 'pl', tr: 'tr', sv: 'sv', da: 'da', no: 'no', hu: 'hu',
  cs: 'cs', ro: 'ro', ja: 'ja', ko: 'ko', zh: 'zh', ru: 'ru',
  ar: 'ar', th: 'th', hi: 'hi', vi: 'vi', el: 'el', fi: 'fi',
  hr: 'hr', id: 'id', ms: 'ms', uk: 'uk', bg: 'bg', sk: 'sk',
};

/** Unicode script ranges → language code */
const SCRIPT_DETECTORS: [RegExp, string][] = [
  [/[\u0900-\u097F]/, 'hi'],  // Devanagari (Hindi, Marathi)
  [/[\u0980-\u09FF]/, 'bn'],  // Bengali
  [/[\u0A00-\u0A7F]/, 'pa'],  // Gurmukhi (Punjabi)
  [/[\u0A80-\u0AFF]/, 'gu'],  // Gujarati
  [/[\u0B80-\u0BFF]/, 'ta'],  // Tamil
  [/[\u0C00-\u0C7F]/, 'te'],  // Telugu
  [/[\u0C80-\u0CFF]/, 'kn'],  // Kannada
  [/[\u0D00-\u0D7F]/, 'ml'],  // Malayalam
  [/[\u0E00-\u0E7F]/, 'th'],  // Thai
  [/[\u3040-\u30FF]/, 'ja'],  // Japanese (Hiragana + Katakana)
  [/[\u4E00-\u9FFF]/, 'zh'],  // Chinese (CJK Unified)
  [/[\uAC00-\uD7AF]/, 'ko'],  // Korean (Hangul)
  [/[\u0400-\u04FF]/, 'ru'],  // Cyrillic (Russian)
  [/[\u0600-\u06FF]/, 'ar'],  // Arabic
  [/[\u0590-\u05FF]/, 'he'],  // Hebrew
];

/**
 * Detect the language of an HTML page.
 *
 * @param html - Raw HTML string
 * @param title - Optional recipe title to check for non-Latin scripts
 * @param url - Optional source URL to check for language path prefixes
 * @returns ISO 639-1 language code or `null` for English/unknown
 */
export function detectLanguage(html: string, title?: string, url?: string): string | null {
  // 1. Check URL path for language prefix (e.g. /es/recipe/...)
  if (url) {
    try {
      const path = new URL(url).pathname;
      const match = path.match(/^\/([a-z]{2})(?:\/|$)/);
      if (match?.[1] && URL_LANG_PREFIXES[match[1]] && match[1] !== 'en') {
        return match[1];
      }
    } catch {
      // invalid URL — skip
    }
  }

  // 2. Check <html lang="...">
  const htmlMatch = HTML_LANG_RE.exec(html);
  if (htmlMatch?.[1]) {
    const lang = htmlMatch[1].split('-')[0]!.toLowerCase().trim();
    if (lang !== 'en' && lang !== '') return lang;
  }

  // 3. Fall back to script detection on title or first chunk of visible text
  const textToCheck = title ?? html.slice(0, 5000);
  for (const [pattern, lang] of SCRIPT_DETECTORS) {
    if (pattern.test(textToCheck)) return lang;
  }

  return null;
}
