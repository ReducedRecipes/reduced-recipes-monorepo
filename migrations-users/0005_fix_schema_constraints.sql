-- =============================================
-- Migration 0005: Fix schema constraints to match spec
-- Fixes:
--   shopping_lists: add collection_id FK, add DEFAULT (datetime('now')) on timestamps
--   shopping_list_items: add original_text NOT NULL, DEFAULT (datetime('now')) on timestamps
--   shopping_list_items: add idx_sli_item index on item column
-- =============================================

-- 1. Recreate shopping_lists with correct constraints
CREATE TABLE shopping_lists_new (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id   TEXT REFERENCES collections(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,
  share_token     TEXT UNIQUE,
  share_expires_at TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO shopping_lists_new (
  id, user_id, collection_id, name, is_default,
  share_token, share_expires_at, created_at, updated_at
)
SELECT
  id, user_id, collection_id, name, is_default,
  share_token, share_expires_at, created_at, updated_at
FROM shopping_lists;

-- Drop indexes before dropping table
DROP INDEX IF EXISTS idx_shopping_lists_user_id;
DROP INDEX IF EXISTS idx_shopping_lists_share_token;

-- Drop dependent tables' FK references by recreating them after
-- First, save shopping_list_recipes data
CREATE TABLE shopping_list_recipes_backup AS SELECT * FROM shopping_list_recipes;
DROP TABLE shopping_list_recipes;

-- Save shopping_list_items data
CREATE TABLE shopping_list_items_backup AS SELECT * FROM shopping_list_items;
DROP TABLE shopping_list_items;

-- Now swap shopping_lists
DROP TABLE shopping_lists;
ALTER TABLE shopping_lists_new RENAME TO shopping_lists;

-- Recreate indexes per spec
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_share ON shopping_lists(share_token);

-- 2. Recreate shopping_list_recipes with DEFAULT on added_at
CREATE TABLE shopping_list_recipes (
  shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id        TEXT NOT NULL,
  added_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shopping_list_id, recipe_id)
);

INSERT INTO shopping_list_recipes (shopping_list_id, recipe_id, added_at)
SELECT shopping_list_id, recipe_id, added_at FROM shopping_list_recipes_backup;
DROP TABLE shopping_list_recipes_backup;

-- 3. Recreate shopping_list_items with original_text NOT NULL and DEFAULT timestamps
CREATE TABLE shopping_list_items_final (
  id               TEXT PRIMARY KEY,
  shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id        TEXT,
  original_text    TEXT NOT NULL,
  quantity         REAL,
  unit             TEXT,
  item             TEXT,
  checked          INTEGER NOT NULL DEFAULT 0,
  parse_failed     INTEGER NOT NULL DEFAULT 0,
  parsing          INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL DEFAULT 'recipe',
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO shopping_list_items_final (
  id, shopping_list_id, recipe_id, original_text, quantity, unit,
  item, checked, parse_failed, parsing, source, position,
  created_at, updated_at
)
SELECT
  id, shopping_list_id, recipe_id, COALESCE(original_text, ''),
  quantity, unit, item, checked, parse_failed, parsing,
  source, position, created_at, updated_at
FROM shopping_list_items_backup;

DROP TABLE shopping_list_items_backup;
ALTER TABLE shopping_list_items_final RENAME TO shopping_list_items;

-- Recreate indexes per spec
CREATE INDEX IF NOT EXISTS idx_sli_list ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_sli_item ON shopping_list_items(item);
