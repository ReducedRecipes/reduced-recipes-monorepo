import { describe, it, expect } from 'vitest';
import { SCHEMA } from '../schema';

describe('schema', () => {
  it('creates saved_recipes table', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS saved_recipes');
  });

  it('has all RecipeDocument columns', () => {
    const columns = [
      'id TEXT PRIMARY KEY',
      'source_url TEXT NOT NULL',
      'domain TEXT NOT NULL',
      'title TEXT NOT NULL',
      'image_url TEXT',
      'author TEXT',
      'yields TEXT',
      'prep_time INTEGER',
      'cook_time INTEGER',
      'total_time INTEGER',
      'ingredients TEXT NOT NULL',
      'instructions TEXT NOT NULL',
      'tags TEXT NOT NULL',
      'cuisine TEXT',
      'category TEXT',
      'keywords TEXT NOT NULL',
      'schema_valid INTEGER NOT NULL',
      'extracted_at TEXT NOT NULL',
      'last_checked TEXT NOT NULL',
      'saved_at TEXT NOT NULL',
    ];
    for (const col of columns) {
      expect(SCHEMA).toContain(col);
    }
  });

  it('creates indexes for common query patterns', () => {
    expect(SCHEMA).toContain('idx_saved_recipes_domain');
    expect(SCHEMA).toContain('idx_saved_recipes_title');
    expect(SCHEMA).toContain('idx_saved_recipes_saved_at');
    expect(SCHEMA).toContain('idx_saved_recipes_cuisine');
    expect(SCHEMA).toContain('idx_saved_recipes_category');
  });

  it('uses IF NOT EXISTS for idempotent creation', () => {
    expect(SCHEMA).toContain('CREATE TABLE IF NOT EXISTS');
    expect(SCHEMA).toContain('CREATE INDEX IF NOT EXISTS');
  });
});
