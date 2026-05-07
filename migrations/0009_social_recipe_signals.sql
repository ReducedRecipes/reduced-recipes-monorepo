-- =============================================
-- Migration 0009: Social recipe signals (denormalised selector inputs)
-- =============================================

CREATE TABLE IF NOT EXISTS social_recipe_signals (
  recipe_id        TEXT PRIMARY KEY,
  save_velocity_7d REAL NOT NULL,
  search_volume_7d REAL NOT NULL DEFAULT 0,
  raw_saves_7d     INTEGER NOT NULL,
  raw_searches_7d  INTEGER NOT NULL,
  computed_at      INTEGER NOT NULL,
  FOREIGN KEY (recipe_id) REFERENCES recipes(id)
);
CREATE INDEX IF NOT EXISTS idx_signals_save_velocity ON social_recipe_signals(save_velocity_7d DESC);
