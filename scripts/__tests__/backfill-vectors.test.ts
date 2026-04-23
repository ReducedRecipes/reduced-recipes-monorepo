import { describe, it, expect } from 'vitest';
import { buildEmbeddingText, parseD1Result, batchChunks } from '../backfill-vectors';

// ── buildEmbeddingText ────────────────────────────────────────────────────────

describe('buildEmbeddingText', () => {
  const baseDoc = {
    id: 'r1',
    title: 'Chicken Tikka Masala',
    domain: 'example.com',
    ingredients: ['chicken breast', 'tomato sauce', 'cream', 'spices'],
    tags: ['indian', 'curry'],
    cuisine: 'Indian',
    category: 'Dinner',
  };

  it('includes the title', () => {
    const text = buildEmbeddingText(baseDoc);
    expect(text).toContain('Chicken Tikka Masala');
  });

  it('includes cuisine when present', () => {
    const text = buildEmbeddingText(baseDoc);
    expect(text).toContain('Indian');
  });

  it('includes category when present', () => {
    const text = buildEmbeddingText(baseDoc);
    expect(text).toContain('Dinner');
  });

  it('includes joined tags', () => {
    const text = buildEmbeddingText(baseDoc);
    expect(text).toContain('indian');
    expect(text).toContain('curry');
  });

  it('includes joined ingredients', () => {
    const text = buildEmbeddingText(baseDoc);
    expect(text).toContain('chicken breast');
    expect(text).toContain('tomato sauce');
  });

  it('omits cuisine when null', () => {
    const doc = { ...baseDoc, cuisine: null };
    const text = buildEmbeddingText(doc);
    // title is still there
    expect(text).toContain('Chicken Tikka Masala');
    // cuisine should not appear (null replaced with nothing)
    expect(text).not.toContain('null');
  });

  it('omits category when null', () => {
    const doc = { ...baseDoc, category: null };
    const text = buildEmbeddingText(doc);
    expect(text).not.toContain('null');
    expect(text).not.toContain('Dinner');
  });

  it('handles empty tags and ingredients gracefully', () => {
    const doc = { ...baseDoc, tags: [], ingredients: [] };
    const text = buildEmbeddingText(doc);
    expect(text).toBeTruthy();
    expect(text).toContain('Chicken Tikka Masala');
  });

  it('collapses extra whitespace', () => {
    const doc = { ...baseDoc, tags: [], ingredients: [] };
    const text = buildEmbeddingText(doc);
    expect(text).not.toMatch(/\s{2,}/);
  });

  it('does not include empty string at start or end', () => {
    const text = buildEmbeddingText(baseDoc);
    expect(text).toBe(text.trim());
  });
});

// ── parseD1Result ─────────────────────────────────────────────────────────────

describe('parseD1Result', () => {
  it('extracts IDs from wrangler d1 execute --json output', () => {
    const raw = JSON.stringify([
      {
        results: [{ id: 'abc123' }, { id: 'def456' }, { id: 'ghi789' }],
        success: true,
        meta: {},
      },
    ]);
    expect(parseD1Result(raw)).toEqual(['abc123', 'def456', 'ghi789']);
  });

  it('returns empty array when results is empty', () => {
    const raw = JSON.stringify([{ results: [], success: true, meta: {} }]);
    expect(parseD1Result(raw)).toEqual([]);
  });

  it('returns empty array when results key is missing', () => {
    const raw = JSON.stringify([{ success: true, meta: {} }]);
    expect(parseD1Result(raw)).toEqual([]);
  });

  it('filters out falsy IDs', () => {
    const raw = JSON.stringify([
      { results: [{ id: 'abc' }, { id: '' }, { id: 'def' }], success: true, meta: {} },
    ]);
    expect(parseD1Result(raw)).toEqual(['abc', 'def']);
  });

  it('handles multiple statement results by using first', () => {
    const raw = JSON.stringify([
      { results: [{ id: 'first' }], success: true, meta: {} },
      { results: [{ id: 'second' }], success: true, meta: {} },
    ]);
    expect(parseD1Result(raw)).toEqual(['first']);
  });
});

// ── batchChunks ───────────────────────────────────────────────────────────────

describe('batchChunks', () => {
  it('splits array into equal-sized chunks', () => {
    const result = batchChunks([1, 2, 3, 4, 5, 6], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('handles remainder in last chunk', () => {
    const result = batchChunks([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when array is smaller than batch size', () => {
    const result = batchChunks([1, 2], 10);
    expect(result).toEqual([[1, 2]]);
  });

  it('returns empty array for empty input', () => {
    expect(batchChunks([], 5)).toEqual([]);
  });

  it('returns one element per chunk when batch size is 1', () => {
    const result = batchChunks(['a', 'b', 'c'], 1);
    expect(result).toEqual([['a'], ['b'], ['c']]);
  });

  it('returns the whole array as one chunk when batch equals length', () => {
    const result = batchChunks([1, 2, 3], 3);
    expect(result).toEqual([[1, 2, 3]]);
  });
});
