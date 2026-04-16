-- Migration: Add dietary_bitmask column to recipes table
-- Supports bitmask-based dietary filtering (16 categories, bits 0-15)
-- Query pattern: WHERE (dietary_bitmask & :mask) = :mask

ALTER TABLE recipes ADD COLUMN dietary_bitmask INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_recipes_dietary_bitmask ON recipes(dietary_bitmask);
