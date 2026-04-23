import { describe, it, expect } from 'vitest';
import { parseExclusions } from './query-parser';

describe('parseExclusions', () => {
  it('returns unchanged query and empty exclusions for plain queries', () => {
    const result = parseExclusions('pasta carbonara');
    expect(result.cleanQuery).toBe('pasta carbonara');
    expect(result.exclusions).toEqual([]);
  });

  it('extracts "no X" exclusion', () => {
    const result = parseExclusions('pasta no gluten');
    expect(result.cleanQuery.trim()).toBe('pasta');
    expect(result.exclusions).toContain('gluten');
  });

  it('extracts "not X" exclusion', () => {
    const result = parseExclusions('soup not dairy');
    expect(result.cleanQuery.trim()).toBe('soup');
    expect(result.exclusions).toContain('dairy');
  });

  it('extracts "without X" exclusion', () => {
    const result = parseExclusions('chicken without mushrooms');
    expect(result.cleanQuery.trim()).toBe('chicken');
    expect(result.exclusions).toContain('mushrooms');
  });

  it('extracts "but not X" exclusion', () => {
    const result = parseExclusions('cake but not nuts');
    expect(result.cleanQuery.trim()).toBe('cake');
    expect(result.exclusions).toContain('nuts');
  });

  it('extracts "-X" (hyphen prefix) exclusion', () => {
    const result = parseExclusions('beef -onion');
    expect(result.cleanQuery.trim()).toBe('beef');
    expect(result.exclusions).toContain('onion');
  });

  it('handles multiple exclusions with "and"', () => {
    const result = parseExclusions('salad without nuts and dairy');
    expect(result.exclusions).toContain('nuts');
    expect(result.exclusions).toContain('dairy');
  });

  it('deduplicates repeated exclusion terms', () => {
    const result = parseExclusions('pasta no gluten no gluten');
    const count = result.exclusions.filter((e) => e === 'gluten').length;
    expect(count).toBe(1);
  });

  it('lowercases exclusion terms', () => {
    const result = parseExclusions('salad no Dairy');
    expect(result.exclusions).toContain('dairy');
  });

  it('handles query with no exclusion keywords but with hyphens in words', () => {
    // "low-fat" should not be treated as an exclusion (no space before hyphen)
    const result = parseExclusions('low-fat yogurt');
    expect(result.exclusions).toEqual([]);
    expect(result.cleanQuery).toContain('yogurt');
  });
});
