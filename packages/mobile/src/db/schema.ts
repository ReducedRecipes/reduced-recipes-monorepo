/**
 * SQLite schema for local saved recipes storage.
 * Matches RecipeDocument fields from @rr/shared.
 */

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS saved_recipes (
  id TEXT PRIMARY KEY NOT NULL,
  source_url TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  author TEXT,
  yields TEXT,
  prep_time INTEGER,
  cook_time INTEGER,
  total_time INTEGER,
  ingredients TEXT NOT NULL DEFAULT '[]',
  instructions TEXT NOT NULL DEFAULT '[]',
  tags TEXT NOT NULL DEFAULT '[]',
  cuisine TEXT,
  category TEXT,
  keywords TEXT NOT NULL DEFAULT '[]',
  schema_valid INTEGER NOT NULL DEFAULT 0,
  extracted_at TEXT NOT NULL,
  last_checked TEXT NOT NULL,
  saved_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_saved_recipes_domain ON saved_recipes(domain);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_title ON saved_recipes(title);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_saved_at ON saved_recipes(saved_at);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_cuisine ON saved_recipes(cuisine);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_category ON saved_recipes(category);
`;

export const OFFLINE_BOOKMARKS_SCHEMA = `
CREATE TABLE IF NOT EXISTS offline_bookmarks (
  id TEXT PRIMARY KEY NOT NULL,
  recipe_id TEXT NOT NULL,
  collection_id TEXT,
  action TEXT NOT NULL CHECK (action IN ('add', 'remove')),
  client_timestamp TEXT NOT NULL,
  synced INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_offline_bookmarks_synced ON offline_bookmarks(synced);
CREATE INDEX IF NOT EXISTS idx_offline_bookmarks_recipe ON offline_bookmarks(recipe_id);
`;
