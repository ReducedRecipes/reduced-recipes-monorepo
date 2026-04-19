-- =============================================
-- Migration 0004: Fix shopping list schema to match spec
-- Fixes mismatches from 0003:
--   shopping_lists: rename share_token_expires_at → share_expires_at
--   shopping_list_items: replace name/canonical_name/is_manual
--     with item/parse_failed/source/position/updated_at
-- =============================================

-- 1. Fix shopping_lists: rename share_token_expires_at → share_expires_at
ALTER TABLE shopping_lists RENAME COLUMN share_token_expires_at TO share_expires_at;

-- 2. Recreate shopping_list_items with correct schema
--    Drop old indexes first
DROP INDEX IF EXISTS idx_shopping_list_items_list_id;
DROP INDEX IF EXISTS idx_shopping_list_items_list_checked;

-- Create new table with correct columns
CREATE TABLE shopping_list_items_new (
  id                TEXT PRIMARY KEY,
  shopping_list_id  TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id         TEXT,
  original_text     TEXT,
  quantity          REAL,
  unit              TEXT,
  item              TEXT,
  checked           INTEGER NOT NULL DEFAULT 0,
  parse_failed      INTEGER NOT NULL DEFAULT 0,
  parsing           INTEGER NOT NULL DEFAULT 0,
  source            TEXT NOT NULL DEFAULT 'recipe',
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

-- Migrate any existing data (map old columns to new)
INSERT INTO shopping_list_items_new (
  id, shopping_list_id, recipe_id, original_text, quantity, unit,
  item, checked, parse_failed, parsing, source, position,
  created_at, updated_at
)
SELECT
  id, shopping_list_id, recipe_id, original_text, quantity, unit,
  COALESCE(canonical_name, name),
  checked,
  0,
  parsing,
  CASE WHEN is_manual = 1 THEN 'manual' ELSE 'recipe' END,
  0,
  created_at,
  created_at
FROM shopping_list_items;

-- Swap tables
DROP TABLE shopping_list_items;
ALTER TABLE shopping_list_items_new RENAME TO shopping_list_items;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_checked ON shopping_list_items(shopping_list_id, checked);
