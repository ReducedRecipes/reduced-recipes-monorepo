import { describe, it, expect, vi } from 'vitest';
import { cursorPaginate, parseLimit } from '../pagination';

// ── Mock D1 ─────────────────────────────────────────────────────────────

function createMockDB(rows: Record<string, unknown>[]) {
  const all = vi.fn(async () => ({ results: rows }));
  const bind = vi.fn(() => ({ all }));
  const prepare = vi.fn(() => ({ bind }));
  return { prepare, bind, all } as unknown as D1Database & {
    prepare: ReturnType<typeof vi.fn>;
    bind: ReturnType<typeof vi.fn>;
    all: ReturnType<typeof vi.fn>;
  };
}

// ── parseLimit ──────────────────────────────────────────────────────────

describe('parseLimit', () => {
  it('returns the default when param is undefined', () => {
    expect(parseLimit(undefined)).toBe(25);
  });

  it('returns the default when param is empty string', () => {
    expect(parseLimit('')).toBe(25);
  });

  it('parses a valid numeric string', () => {
    expect(parseLimit('10')).toBe(10);
  });

  it('falls back to default for zero (falsy)', () => {
    expect(parseLimit('0')).toBe(25);
  });

  it('clamps to 1 for negative values', () => {
    expect(parseLimit('-5')).toBe(1);
  });

  it('clamps to maxLimit when value exceeds it', () => {
    expect(parseLimit('200')).toBe(100);
  });

  it('respects custom defaultLimit', () => {
    expect(parseLimit(undefined, 24)).toBe(24);
  });

  it('respects custom maxLimit', () => {
    expect(parseLimit('75', 25, 50)).toBe(50);
  });

  it('falls back to default for NaN input', () => {
    expect(parseLimit('abc')).toBe(25);
  });
});

// ── cursorPaginate ──────────────────────────────────────────────────────

describe('cursorPaginate', () => {
  it('returns all items and null cursor when fewer than limit rows', async () => {
    const rows = [
      { id: '1', created_at: '2025-01-03' },
      { id: '2', created_at: '2025-01-02' },
    ];
    const db = createMockDB(rows);

    const result = await cursorPaginate<typeof rows[0]>({
      db,
      query: 'SELECT * FROM items ORDER BY created_at DESC',
      params: [],
      cursorColumn: 'created_at',
      limit: 5,
    });

    expect(result.items).toEqual(rows);
    expect(result.next_cursor).toBeNull();
  });

  it('returns exactly limit items when rows equal limit (no overflow)', async () => {
    const rows = [
      { id: '1', created_at: '2025-01-03' },
      { id: '2', created_at: '2025-01-02' },
      { id: '3', created_at: '2025-01-01' },
    ];
    const db = createMockDB(rows);

    const result = await cursorPaginate<typeof rows[0]>({
      db,
      query: 'SELECT * FROM items ORDER BY created_at DESC',
      params: [],
      cursorColumn: 'created_at',
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.next_cursor).toBeNull();
  });

  it('pops overflow row and returns next_cursor from the last item', async () => {
    const rows = [
      { id: '1', created_at: '2025-01-04' },
      { id: '2', created_at: '2025-01-03' },
      { id: '3', created_at: '2025-01-02' },
      { id: '4', created_at: '2025-01-01' }, // overflow row
    ];
    const db = createMockDB(rows);

    const result = await cursorPaginate<typeof rows[0]>({
      db,
      query: 'SELECT * FROM items ORDER BY created_at DESC',
      params: [],
      cursorColumn: 'created_at',
      limit: 3,
    });

    expect(result.items).toHaveLength(3);
    expect(result.items.map((r) => r.id)).toEqual(['1', '2', '3']);
    expect(result.next_cursor).toBe('2025-01-02');
  });

  it('appends limit+1 to params and passes them to prepare/bind', async () => {
    const db = createMockDB([]);

    await cursorPaginate({
      db,
      query: 'SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC',
      params: ['user-1'],
      cursorColumn: 'created_at',
      limit: 10,
    });

    expect(db.prepare).toHaveBeenCalledWith(
      'SELECT * FROM items WHERE user_id = ? ORDER BY created_at DESC LIMIT ?',
    );
    // bind receives original params + limit+1
    expect(db.prepare().bind).toHaveBeenCalledWith('user-1', 11);
  });

  it('handles empty result set', async () => {
    const db = createMockDB([]);

    const result = await cursorPaginate({
      db,
      query: 'SELECT * FROM items ORDER BY created_at DESC',
      params: [],
      cursorColumn: 'created_at',
      limit: 25,
    });

    expect(result.items).toEqual([]);
    expect(result.next_cursor).toBeNull();
  });

  it('works with a different cursor column name', async () => {
    const rows = [
      { id: '1', extracted_at: '2025-03-01' },
      { id: '2', extracted_at: '2025-02-01' },
      { id: '3', extracted_at: '2025-01-01' }, // overflow
    ];
    const db = createMockDB(rows);

    const result = await cursorPaginate<typeof rows[0]>({
      db,
      query: 'SELECT * FROM recipes ORDER BY extracted_at DESC',
      params: [],
      cursorColumn: 'extracted_at',
      limit: 2,
    });

    expect(result.items).toHaveLength(2);
    expect(result.next_cursor).toBe('2025-02-01');
  });
});
