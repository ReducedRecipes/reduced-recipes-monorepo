-- Migration: Add canonical_name and category columns to shopping_list_items
-- These columns link items to the ingredient_canon system for deduplication and aisle grouping

ALTER TABLE shopping_list_items ADD COLUMN canonical_name TEXT;
ALTER TABLE shopping_list_items ADD COLUMN category TEXT;
