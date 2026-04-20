-- =============================================
-- Migration 0007: Recipe votes for hot ranking
-- =============================================

-- Tracks per-user vote actions used to compute hot scores
CREATE TABLE IF NOT EXISTS recipe_votes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id  TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1.0,
  action     TEXT NOT NULL, -- 'heart', 'list_add', 'unheart', 'view'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id, action)
);

CREATE INDEX IF NOT EXISTS idx_rv_recipe  ON recipe_votes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_rv_created ON recipe_votes(created_at DESC);
