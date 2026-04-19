import { describe, it, expect } from 'vitest';
import { parseLimit, paginateRows } from './pagination';

describe('parseLimit', () => {
  it('returns default 25 for undefined', () => {
    expect(parseLimit(undefined)).toBe(25);
  });

  it('parses valid number string', () => {
    expect(parseLimit('10')).toBe(10);
  });

  it('treats 0 as default (falsy)', () => {
    expect(parseLimit('0')).toBe(25);
  });

  it('clamps to minimum of 1', () => {
    expect(parseLimit('1')).toBe(1);
  });

  it('clamps to maximum of 100', () => {
    expect(parseLimit('200')).toBe(100);
  });

  it('uses custom default', () => {
    expect(parseLimit(undefined, 50)).toBe(50);
  });

  it('handles non-numeric string', () => {
    expect(parseLimit('abc')).toBe(25);
  });
});

describe('paginateRows', () => {
  it('returns all items and null cursor when rows <= limit', () => {
    const rows = [
      { id: '1', created_at: '2024-01-01' },
      { id: '2', created_at: '2024-01-02' },
    ];
    const result = paginateRows(rows, 5, 'created_at');
    expect(result.items).toHaveLength(2);
    expect(result.next_cursor).toBeNull();
  });

  it('pops extra row and returns cursor when rows > limit', () => {
    const rows = [
      { id: '1', created_at: '2024-01-03' },
      { id: '2', created_at: '2024-01-02' },
      { id: '3', created_at: '2024-01-01' },
    ];
    const result = paginateRows(rows, 2, 'created_at');
    expect(result.items).toHaveLength(2);
    expect(result.next_cursor).toBe('2024-01-02');
  });

  it('returns null cursor when last row is undefined after pop', () => {
    const rows: { id: string; ts: string }[] = [{ id: '1', ts: 'a' }];
    // limit=0 means rows.length > limit, pop leaves empty array
    const result = paginateRows(rows, 0, 'ts');
    expect(result.next_cursor).toBeNull();
    expect(result.items).toHaveLength(0);
  });

  it('works with different cursor fields', () => {
    const rows = [
      { id: '1', followed_at: '2024-03-01' },
      { id: '2', followed_at: '2024-02-01' },
      { id: '3', followed_at: '2024-01-01' },
    ];
    const result = paginateRows(rows, 2, 'followed_at');
    expect(result.next_cursor).toBe('2024-02-01');
  });
});
