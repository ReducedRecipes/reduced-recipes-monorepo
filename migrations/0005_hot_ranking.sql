-- =============================================
-- Migration 0005: Hot ranking schema for recipes
-- =============================================

-- Add hot ranking columns to recipes table
ALTER TABLE recipes ADD COLUMN hot_score REAL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN vote_count INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN first_voted_at TEXT;

-- Index for hot ranking queries (descending for TOP-N lookups)
CREATE INDEX IF NOT EXISTS idx_recipes_hot ON recipes(hot_score DESC);
