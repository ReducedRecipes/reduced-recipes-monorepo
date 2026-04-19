-- Migration: Create ingredient_canon table for canonical ingredient names and categories
-- This table serves as a self-building knowledge base for ingredient classification

CREATE TABLE ingredient_canon (
  canonical_name TEXT PRIMARY KEY,
  aliases TEXT NOT NULL DEFAULT '[]',
  category TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ingredient_canon_category ON ingredient_canon(category);
