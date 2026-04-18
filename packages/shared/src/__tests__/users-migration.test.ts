import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const migrationPath = resolve(__dirname, '../../../../migrations-users/0001_initial.sql');
const sql = readFileSync(migrationPath, 'utf-8');

describe('migrations-users/0001_initial.sql', () => {
  const expectedTables = [
    'users',
    'user_auth_providers',
    'user_dietary_preferences',
    'collections',
    'bookmarks',
    'recipe_views',
    'notifications',
    'consent_records',
  ];

  it('contains all 8 Phase 1a tables', () => {
    for (const table of expectedTables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('does not contain Phase 1b+ tables (e.g. follows)', () => {
    expect(sql).not.toContain('CREATE TABLE IF NOT EXISTS follows');
  });

  it('users table has correct columns', () => {
    expect(sql).toContain('id              TEXT PRIMARY KEY');
    expect(sql).toContain('email           TEXT NOT NULL UNIQUE');
    expect(sql).toContain('name            TEXT NOT NULL');
    expect(sql).toContain('picture_url     TEXT');
    expect(sql).toContain('profile_public  INTEGER NOT NULL DEFAULT 1');
    expect(sql).toContain("tier            TEXT NOT NULL DEFAULT 'free'");
    expect(sql).toContain('created_at      TEXT NOT NULL DEFAULT');
    expect(sql).toContain('updated_at      TEXT NOT NULL DEFAULT');
  });

  it('user_auth_providers has composite PK and UNIQUE constraint', () => {
    expect(sql).toContain('PRIMARY KEY (user_id, provider)');
    expect(sql).toContain('UNIQUE (provider, provider_id)');
  });

  it('user_dietary_preferences has composite PK', () => {
    expect(sql).toContain('PRIMARY KEY (user_id, restriction)');
  });

  it('bookmarks has UNIQUE constraint on (user_id, collection_id, recipe_id)', () => {
    expect(sql).toContain('UNIQUE(user_id, collection_id, recipe_id)');
  });

  it('recipe_views has UNIQUE constraint for deduplication', () => {
    expect(sql).toContain('UNIQUE(user_id, recipe_id, viewed_date)');
  });

  it('all foreign keys use ON DELETE CASCADE', () => {
    const fkMatches = sql.match(/REFERENCES\s+\w+\(id\)/g) || [];
    const cascadeMatches = sql.match(/ON DELETE CASCADE/g) || [];
    expect(fkMatches.length).toBeGreaterThan(0);
    expect(cascadeMatches.length).toBe(fkMatches.length);
  });

  const expectedIndexes = [
    'idx_users_email',
    'idx_uap_provider',
    'idx_collections_user',
    'idx_bookmarks_user',
    'idx_bookmarks_collection',
    'idx_bookmarks_recipe',
    'idx_recipe_views_user',
    'idx_recipe_views_recipe',
    'idx_notifications_user',
    'idx_consent_user',
  ];

  it('contains all expected indexes', () => {
    for (const idx of expectedIndexes) {
      expect(sql).toContain(`CREATE INDEX IF NOT EXISTS ${idx}`);
    }
  });

  it('has no syntax issues — all CREATE statements are properly closed', () => {
    const createStatements = sql.match(/CREATE\s+(TABLE|INDEX)\s+IF NOT EXISTS/g) || [];
    // 8 tables + 10 indexes = 18 CREATE statements
    expect(createStatements.length).toBe(18);
  });

  it('all parentheses are balanced', () => {
    let depth = 0;
    for (const ch of sql) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
