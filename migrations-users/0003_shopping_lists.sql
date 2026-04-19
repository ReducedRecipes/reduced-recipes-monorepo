-- =============================================
-- Migration 0003: Shopping list tables (Phase 2)
-- =============================================

-- Shopping lists
CREATE TABLE IF NOT EXISTS shopping_lists (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                    TEXT NOT NULL DEFAULT 'My Shopping List',
  is_default              INTEGER NOT NULL DEFAULT 0,
  share_token             TEXT UNIQUE,
  share_token_expires_at  TEXT,
  collection_id           TEXT,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_share_token ON shopping_lists(share_token);

-- Shopping list recipes (which recipes have been added to a list)
CREATE TABLE IF NOT EXISTS shopping_list_recipes (
  shopping_list_id  TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id         TEXT NOT NULL,
  added_at          TEXT NOT NULL,
  PRIMARY KEY (shopping_list_id, recipe_id)
);

-- Shopping list items (individual ingredient items)
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id                TEXT PRIMARY KEY,
  shopping_list_id  TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id         TEXT,
  name              TEXT NOT NULL,
  canonical_name    TEXT NOT NULL,
  quantity          REAL,
  unit              TEXT,
  checked           INTEGER NOT NULL DEFAULT 0,
  is_manual         INTEGER NOT NULL DEFAULT 0,
  parsing           INTEGER NOT NULL DEFAULT 0,
  original_text     TEXT,
  created_at        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_id ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_list_checked ON shopping_list_items(shopping_list_id, checked);
