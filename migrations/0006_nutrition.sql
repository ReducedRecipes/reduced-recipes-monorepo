-- Add nutrition columns to recipes table
ALTER TABLE recipes ADD COLUMN calories INTEGER;
ALTER TABLE recipes ADD COLUMN protein_g REAL;
ALTER TABLE recipes ADD COLUMN fat_g REAL;
ALTER TABLE recipes ADD COLUMN carbs_g REAL;
ALTER TABLE recipes ADD COLUMN fiber_g REAL;
ALTER TABLE recipes ADD COLUMN sodium_mg REAL;
ALTER TABLE recipes ADD COLUMN nutrition_source TEXT; -- 'schema' | 'ai'
