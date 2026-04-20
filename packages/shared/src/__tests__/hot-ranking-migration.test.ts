// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const recipesPath = resolve(__dirname, '../../../../migrations/0005_hot_ranking.sql');
const usersPath = resolve(__dirname, '../../../../migrations-users/0007_recipe_votes.sql');

const recipesSql = readFileSync(recipesPath, 'utf-8');
const usersSql = readFileSync(usersPath, 'utf-8');

describe('migrations/0005_hot_ranking.sql', () => {
  it('adds hot_score column to recipes table', () => {
    expect(recipesSql).toContain('ALTER TABLE recipes ADD COLUMN hot_score REAL DEFAULT 0');
  });

  it('adds vote_count column to recipes table', () => {
    expect(recipesSql).toContain('ALTER TABLE recipes ADD COLUMN vote_count INTEGER DEFAULT 0');
  });

  it('adds first_voted_at column to recipes table', () => {
    expect(recipesSql).toContain('ALTER TABLE recipes ADD COLUMN first_voted_at TEXT');
  });

  it('creates idx_recipes_hot index on hot_score DESC', () => {
    expect(recipesSql).toContain('CREATE INDEX IF NOT EXISTS idx_recipes_hot ON recipes(hot_score DESC)');
  });

  it('has valid SQL — no unbalanced parentheses', () => {
    let depth = 0;
    for (const ch of recipesSql) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});

describe('migrations-users/0007_recipe_votes.sql', () => {
  it('creates recipe_votes table', () => {
    expect(usersSql).toContain('CREATE TABLE IF NOT EXISTS recipe_votes');
  });

  it('user_id references users(id) ON DELETE CASCADE', () => {
    expect(usersSql).toContain('user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE');
  });

  it('has recipe_id column', () => {
    expect(usersSql).toContain('recipe_id  TEXT NOT NULL');
  });

  it('has weight column with default 1.0', () => {
    expect(usersSql).toContain('weight     REAL NOT NULL DEFAULT 1.0');
  });

  it('has action column', () => {
    expect(usersSql).toContain('action     TEXT NOT NULL');
  });

  it('has created_at column with default datetime now', () => {
    expect(usersSql).toContain("created_at TEXT NOT NULL DEFAULT (datetime('now'))");
  });

  it('has composite PRIMARY KEY (user_id, recipe_id, action)', () => {
    expect(usersSql).toContain('PRIMARY KEY (user_id, recipe_id, action)');
  });

  it('creates idx_rv_recipe index on recipe_id', () => {
    expect(usersSql).toContain('CREATE INDEX IF NOT EXISTS idx_rv_recipe  ON recipe_votes(recipe_id)');
  });

  it('creates idx_rv_created index on created_at DESC', () => {
    expect(usersSql).toContain('CREATE INDEX IF NOT EXISTS idx_rv_created ON recipe_votes(created_at DESC)');
  });

  it('has valid SQL — no unbalanced parentheses', () => {
    let depth = 0;
    for (const ch of usersSql) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});
