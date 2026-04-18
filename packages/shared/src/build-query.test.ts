import { describe, it, expect } from 'vitest';
import { buildQuery } from './build-query';

describe('buildQuery', () => {
  it('returns empty string for empty params', () => {
    expect(buildQuery({})).toBe('');
  });

  it('builds query string from string values', () => {
    expect(buildQuery({ q: 'hello', tag: 'vegan' })).toBe('?q=hello&tag=vegan');
  });

  it('builds query string from number values', () => {
    expect(buildQuery({ limit: 10, offset: 0 })).toBe('?limit=10&offset=0');
  });

  it('skips undefined values', () => {
    expect(buildQuery({ q: 'hello', tag: undefined })).toBe('?q=hello');
  });

  it('skips null values', () => {
    expect(buildQuery({ q: 'hello', tag: null })).toBe('?q=hello');
  });

  it('converts arrays to strings', () => {
    expect(buildQuery({ tags: ['a', 'b'] })).toBe('?tags=a%2Cb');
  });

  it('returns empty string when all values are undefined', () => {
    expect(buildQuery({ a: undefined, b: undefined })).toBe('');
  });
});
