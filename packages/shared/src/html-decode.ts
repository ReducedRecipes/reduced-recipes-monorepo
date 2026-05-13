/**
 * Decode an HTML response body honouring the declared character encoding.
 *
 * We can't rely on `Response.text()` because Workers' implementation always
 * decodes as UTF-8 regardless of the `charset=` directive in the response
 * Content-Type. That silently produces mojibake for any page served in
 * Windows-1251, Shift_JIS, EUC-KR, GB2312, ISO-8859-*, etc. — and once the
 * title is garbled the downstream LLM translator just hallucinates.
 *
 * Encoding-detection order:
 *   1. `charset=` in the Content-Type header
 *   2. `<meta charset="...">` or `<meta http-equiv="Content-Type" ...>` in
 *      the first ~1 KiB of the body
 *   3. UTF-8 fallback
 *
 * `TextDecoder` in Workers covers the full WHATWG Encoding spec
 * (windows-125x, koi8-r, gbk, big5, shift_jis, euc-jp, euc-kr, iso-8859-*).
 */

const CHARSET_FROM_CONTENT_TYPE = /charset\s*=\s*["']?([\w-]+)/i;
const META_CHARSET = /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i;

function normaliseCharset(label: string): string {
  const lower = label.trim().toLowerCase();
  if (lower === 'utf8') return 'utf-8';
  return lower;
}

function tryDecode(buffer: ArrayBuffer, encoding: string): string | null {
  try {
    return new TextDecoder(encoding).decode(buffer);
  } catch {
    return null;
  }
}

export function detectCharset(buffer: ArrayBuffer, contentType: string): string {
  const fromHeader = CHARSET_FROM_CONTENT_TYPE.exec(contentType);
  if (fromHeader?.[1]) return normaliseCharset(fromHeader[1]);

  const head = new TextDecoder('latin1').decode(buffer.slice(0, 1024));
  const fromMeta = META_CHARSET.exec(head);
  if (fromMeta?.[1]) return normaliseCharset(fromMeta[1]);

  return 'utf-8';
}

export function decodeHtml(buffer: ArrayBuffer, contentType: string): string {
  const charset = detectCharset(buffer, contentType);
  return tryDecode(buffer, charset) ?? tryDecode(buffer, 'utf-8') ?? '';
}
