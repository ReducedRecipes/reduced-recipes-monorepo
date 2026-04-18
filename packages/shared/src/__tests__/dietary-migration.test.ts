import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationPath = resolve(__dirname, '../../../../migrations/0003_dietary_bitmask.sql');
const sql = readFileSync(migrationPath, 'utf-8');

describe('migrations/0003_dietary_bitmask.sql', () => {
  it('adds dietary_bitmask column to recipes table', () => {
    expect(sql).toContain('ALTER TABLE recipes ADD COLUMN dietary_bitmask INTEGER NOT NULL DEFAULT 0');
  });

  it('creates index on dietary_bitmask column', () => {
    expect(sql).toContain('CREATE INDEX idx_recipes_dietary_bitmask ON recipes(dietary_bitmask)');
  });

  it('has valid SQL — no unbalanced parentheses', () => {
    let depth = 0;
    for (const ch of sql) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('contains exactly 2 statements (ALTER + CREATE INDEX)', () => {
    const statements = sql.split(';').filter(s => s.trim().length > 0 && !s.trim().split('\n').every(l => l.trim() === '' || l.trim().startsWith('--')));
    expect(statements.length).toBe(2);
  });
});
