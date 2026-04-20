-- =============================================
-- Migration 0005: Hot ranking score column
-- =============================================

ALTER TABLE recipes ADD COLUMN hot_score REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_recipes_hot_score ON recipes(hot_score DESC);
