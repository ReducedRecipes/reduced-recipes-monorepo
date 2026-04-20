-- =============================================
-- Migration 0004: Ingredient index for ingredient-based search
-- =============================================

-- Ingredient vocabulary with usage counts
CREATE TABLE IF NOT EXISTS ingredients (
  name       TEXT PRIMARY KEY,
  aliases    TEXT,              -- JSON array of alternative names
  category   TEXT,              -- produce, protein, dairy, pantry, spice, etc.
  count      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ingredients_count ON ingredients(count DESC);

-- Junction: which ingredients appear in which recipes
CREATE TABLE IF NOT EXISTS recipe_ingredients (
  recipe_id    TEXT NOT NULL,
  ingredient   TEXT NOT NULL,
  PRIMARY KEY (recipe_id, ingredient)
);

CREATE INDEX IF NOT EXISTS idx_ri_ingredient ON recipe_ingredients(ingredient);
CREATE INDEX IF NOT EXISTS idx_ri_recipe ON recipe_ingredients(recipe_id);
