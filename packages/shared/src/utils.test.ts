import { describe, it, expect } from 'vitest';
import { chunk, chunks, cleanText, parseDuration } from './utils';

describe('chunk', () => {
  it('splits array into chunks of given size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns single chunk when array is smaller than size', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it('returns empty array for empty input', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('chunks alias works identically', () => {
    expect(chunks([1, 2, 3], 2)).toEqual(chunk([1, 2, 3], 2));
  });
});

describe('cleanText', () => {
  it('strips HTML tags', () => {
    expect(cleanText('<p>Hello <b>World</b></p>')).toBe('Hello World');
  });

  it('decodes HTML entities', () => {
    expect(cleanText('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(cleanText('&lt;div&gt;')).toBe('<div>');
    expect(cleanText('&quot;hello&quot;')).toBe('"hello"');
    expect(cleanText('it&#39;s')).toBe("it's");
  });

  it('collapses whitespace and trims', () => {
    expect(cleanText('  hello   world  ')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(cleanText('')).toBe('');
  });
});

describe('parseDuration', () => {
  it('parses hours and minutes', () => {
    expect(parseDuration('PT1H30M')).toBe(90);
  });

  it('parses minutes only', () => {
    expect(parseDuration('PT45M')).toBe(45);
  });

  it('parses hours only', () => {
    expect(parseDuration('PT2H')).toBe(120);
  });

  it('parses seconds and rounds', () => {
    expect(parseDuration('PT30S')).toBe(1); // 30s rounds to 1 min
  });

  it('returns null for invalid format', () => {
    expect(parseDuration('')).toBeNull();
    expect(parseDuration('invalid')).toBeNull();
    expect(parseDuration('P1D')).toBeNull();
  });

  it('returns null for zero duration', () => {
    expect(parseDuration('PT0S')).toBeNull();
  });
});
