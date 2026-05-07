-- Codifies recipes.original_language, used by packages/workers/src/projection.ts.
-- The column already exists in prod (otherwise projection inserts would fail).
-- For fresh local DBs this migration adds it. For prod, mark as applied
-- without running. See migrations/README.md "prod-bypass" section.
--
-- Prod-bypass: if ALTER TABLE fails in prod with "duplicate column name",
-- the column already exists. Mark the migration as applied by inserting
-- into the d1_migrations ledger directly (see migrations/README.md).

ALTER TABLE recipes ADD COLUMN original_language TEXT;
CREATE INDEX IF NOT EXISTS idx_recipes_original_language ON recipes(original_language);
