import { describe, it, expect } from 'vitest';
import { decodeHtml, detectCharset } from './html-decode';

function encode(text: string, _encoding: 'utf-8'): ArrayBuffer {
  const view = new TextEncoder().encode(text);
  const buf = new ArrayBuffer(view.byteLength);
  new Uint8Array(buf).set(view);
  return buf;
}

// Build a Windows-1251 byte buffer manually for a known Cyrillic string.
// 'Куриное' in Windows-1251 is: 0xCA 0xF3 0xF0 0xE8 0xED 0xEE 0xE5
function bytes(...vals: number[]): ArrayBuffer {
  const buf = new ArrayBuffer(vals.length);
  new Uint8Array(buf).set(vals);
  return buf;
}

describe('detectCharset', () => {
  it('prefers charset from Content-Type header', () => {
    const buf = encode('<html></html>', 'utf-8');
    expect(detectCharset(buf, 'text/html; charset=windows-1251')).toBe('windows-1251');
    expect(detectCharset(buf, 'text/html; charset="utf-8"')).toBe('utf-8');
  });

  it('falls back to <meta charset> when header omits it', () => {
    const head = '<!doctype html><html><head><meta charset="windows-1251">';
    const buf = encode(head, 'utf-8');
    expect(detectCharset(buf, 'text/html')).toBe('windows-1251');
  });

  it('falls back to <meta http-equiv Content-Type>', () => {
    const head = '<html><head><meta http-equiv="Content-Type" content="text/html; charset=shift_jis">';
    const buf = encode(head, 'utf-8');
    expect(detectCharset(buf, 'text/html')).toBe('shift_jis');
  });

  it('defaults to utf-8 when no hint is present', () => {
    const buf = encode('<html><body>hi</body></html>', 'utf-8');
    expect(detectCharset(buf, 'text/html')).toBe('utf-8');
  });

  it('normalises "utf8" alias to "utf-8"', () => {
    const buf = encode('<html></html>', 'utf-8');
    expect(detectCharset(buf, 'text/html; charset=utf8')).toBe('utf-8');
  });
});

describe('decodeHtml', () => {
  it('decodes Windows-1251 Cyrillic correctly when Content-Type says so', () => {
    // 'Куриное' = 0xCA 0xF3 0xF0 0xE8 0xED 0xEE 0xE5 in Windows-1251.
    const cyrillic = bytes(0xCA, 0xF3, 0xF0, 0xE8, 0xED, 0xEE, 0xE5);
    const html = decodeHtml(cyrillic, 'text/html; charset=windows-1251');
    expect(html).toBe('Куриное');
  });

  it('decodes Windows-1251 via <meta charset> when header is missing', () => {
    // Combine an ASCII <meta charset> declaration with raw Windows-1251 bytes.
    const meta = new TextEncoder().encode(
      '<html><head><meta charset="windows-1251"></head><body>',
    );
    const body = new Uint8Array([0xCA, 0xF3, 0xF0, 0xE8, 0xED, 0xEE, 0xE5]);
    const buf = new Uint8Array(meta.length + body.length);
    buf.set(meta, 0);
    buf.set(body, meta.length);
    const html = decodeHtml(buf.buffer, 'text/html');
    expect(html).toContain('Куриное');
  });

  it('decodes UTF-8 (default path)', () => {
    const buf = encode('<html>Куриное</html>', 'utf-8');
    expect(decodeHtml(buf, 'text/html; charset=utf-8')).toBe('<html>Куриное</html>');
  });

  it('falls back to utf-8 when declared charset label is unknown', () => {
    const buf = encode('<html>hello</html>', 'utf-8');
    // 'x-bogus' isn't a real encoding; TextDecoder will throw on construction.
    const html = decodeHtml(buf, 'text/html; charset=x-bogus');
    expect(html).toBe('<html>hello</html>');
  });

  it('regression: Russian title that previously came out as mojibake', () => {
    // 'Куриное филе' in Windows-1251.
    const buf = bytes(0xCA, 0xF3, 0xF0, 0xE8, 0xED, 0xEE, 0xE5, 0x20, 0xF4, 0xE8, 0xEB, 0xE5);
    const html = decodeHtml(buf, 'text/html; charset=windows-1251');
    expect(html).toBe('Куриное филе');
    // Same bytes interpreted as UTF-8 produce U+FFFD replacement characters.
    expect(html.includes('�')).toBe(false);
  });
});
