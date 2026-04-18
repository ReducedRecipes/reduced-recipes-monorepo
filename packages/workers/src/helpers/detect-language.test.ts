import { describe, it, expect } from 'vitest';
import { detectLanguage } from './detect-language';

describe('detectLanguage', () => {
  it('returns null for English pages', () => {
    expect(detectLanguage('<html lang="en"><body></body></html>')).toBeNull();
  });

  it('returns null for en-US locale', () => {
    expect(detectLanguage('<html lang="en-US"><body></body></html>')).toBeNull();
  });

  it('returns null for en-GB locale', () => {
    expect(detectLanguage('<html lang="en-GB"><body></body></html>')).toBeNull();
  });

  it('detects German (de)', () => {
    expect(detectLanguage('<html lang="de"><body></body></html>')).toBe('de');
  });

  it('detects French (fr)', () => {
    expect(detectLanguage('<html lang="fr"><body></body></html>')).toBe('fr');
  });

  it('detects Spanish (es)', () => {
    expect(detectLanguage('<html lang="es"><body></body></html>')).toBe('es');
  });

  it('normalises de-DE to de', () => {
    expect(detectLanguage('<html lang="de-DE"><body></body></html>')).toBe('de');
  });

  it('normalises pt-BR to pt', () => {
    expect(detectLanguage('<html lang="pt-BR"><body></body></html>')).toBe('pt');
  });

  it('normalises zh-TW to zh', () => {
    expect(detectLanguage('<html lang="zh-TW"><body></body></html>')).toBe('zh');
  });

  it('returns null when no lang attribute present', () => {
    expect(detectLanguage('<html><body></body></html>')).toBeNull();
  });

  it('returns null for empty HTML', () => {
    expect(detectLanguage('')).toBeNull();
  });

  it('returns null for non-HTML content', () => {
    expect(detectLanguage('just some plain text')).toBeNull();
  });

  it('handles single-quoted lang attribute', () => {
    expect(detectLanguage("<html lang='fr'><body></body></html>")).toBe('fr');
  });

  it('handles lang with extra attributes', () => {
    expect(detectLanguage('<html class="no-js" lang="it" dir="ltr"><body></body></html>')).toBe('it');
  });

  it('is case-insensitive for lang value', () => {
    expect(detectLanguage('<html lang="DE"><body></body></html>')).toBe('de');
  });

  it('returns null for empty lang attribute', () => {
    expect(detectLanguage('<html lang=""><body></body></html>')).toBeNull();
  });

  it('handles lang with whitespace', () => {
    const result = detectLanguage('<html lang="ja"><body></body></html>');
    expect(result).toBe('ja');
  });
});
