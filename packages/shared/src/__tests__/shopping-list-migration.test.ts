import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const migration0003Path = resolve(__dirname, '../../../../migrations-users/0003_shopping_lists.sql');
const migration0004Path = resolve(__dirname, '../../../../migrations-users/0004_fix_shopping_list_schema.sql');
const sql0003 = readFileSync(migration0003Path, 'utf-8');
const sql0004 = readFileSync(migration0004Path, 'utf-8');

describe('migrations-users/0004_fix_shopping_list_schema.sql', () => {
  it('renames share_token_expires_at to share_expires_at', () => {
    expect(sql0004).toContain('RENAME COLUMN share_token_expires_at TO share_expires_at');
  });

  it('drops old indexes before recreating', () => {
    expect(sql0004).toContain('DROP INDEX IF EXISTS idx_shopping_list_items_list_id');
    expect(sql0004).toContain('DROP INDEX IF EXISTS idx_shopping_list_items_list_checked');
  });

  it('creates new table with correct columns from spec', () => {
    const requiredColumns = [
      'item',
      'parse_failed',
      'source',
      'position',
      'updated_at',
      'original_text',
      'quantity',
      'unit',
      'checked',
      'parsing',
    ];
    for (const col of requiredColumns) {
      expect(sql0004).toContain(col);
    }
  });

  it('does not contain removed columns in new table definition', () => {
    // The new table (shopping_list_items_new) should not have name/canonical_name/is_manual as columns
    // They may appear in the INSERT SELECT for data migration, so check only the CREATE TABLE
    const createTableBlock = sql0004.match(
      /CREATE TABLE shopping_list_items_new\s*\(([\s\S]*?)\);/
    );
    expect(createTableBlock).toBeTruthy();
    const createBody = createTableBlock![1];
    // These old columns should NOT be in the new table definition
    expect(createBody).not.toMatch(/\bname\b/);
    expect(createBody).not.toContain('canonical_name');
    expect(createBody).not.toContain('is_manual');
  });

  it('migrates data from old table to new', () => {
    expect(sql0004).toContain('INSERT INTO shopping_list_items_new');
    expect(sql0004).toContain('FROM shopping_list_items');
  });

  it('maps is_manual to source column correctly', () => {
    expect(sql0004).toContain("CASE WHEN is_manual = 1 THEN 'manual' ELSE 'recipe' END");
  });

  it('drops old table and renames new table', () => {
    expect(sql0004).toContain('DROP TABLE shopping_list_items');
    expect(sql0004).toContain('ALTER TABLE shopping_list_items_new RENAME TO shopping_list_items');
  });

  it('recreates indexes after table swap', () => {
    // After the DROP/RENAME, the indexes should be recreated
    const afterRename = sql0004.split('RENAME TO shopping_list_items')[1];
    expect(afterRename).toContain('idx_shopping_list_items_list_id');
    expect(afterRename).toContain('idx_shopping_list_items_list_checked');
  });

  it('has balanced parentheses', () => {
    let depth = 0;
    for (const ch of sql0004) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('0003 has the old column names that 0004 fixes', () => {
    // Verify that 0003 actually has the problematic columns
    expect(sql0003).toContain('share_token_expires_at');
    expect(sql0003).toContain('canonical_name');
    expect(sql0003).toContain('is_manual');
    // And does NOT have the correct column names
    expect(sql0003).not.toContain('share_expires_at');
    expect(sql0003).not.toContain('parse_failed');
    expect(sql0003).not.toMatch(/\bsource\b/);
    expect(sql0003).not.toMatch(/\bposition\b/);
  });
});
