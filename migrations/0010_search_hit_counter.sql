-- =============================================
-- Migration 0010: Search hit counter (per-recipe, per-day)
-- =============================================

CREATE TABLE IF NOT EXISTS social_search_hits (
  recipe_id  TEXT NOT NULL,
  date       TEXT NOT NULL,
  hits       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (recipe_id, date),
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
CREATE INDEX IF NOT EXISTS idx_search_hits_date ON social_search_hits(date);
