# Recipes DB migrations

This directory contains the SQL migrations for the `reduced-recipes-prod` D1 database (the recipes DB). Migrations are applied via Wrangler in CI:

```sh
pnpm exec wrangler d1 migrations apply reduced-recipes-prod --remote \
  --config packages/workers/wrangler.api.toml
```

Other databases have their own directories and Wrangler configs:

- `migrations-users/` -> `reduced-recipes-users`
- `migrations-crawl/` -> `reduced-recipes-crawl`
- `migrations-funding/` -> `reduced-recipes-funding`

## Adding a new migration

Create a numbered SQL file (e.g. `0014_feature_name.sql`). Wrangler applies them in lexicographic order and tracks which have run in an internal ledger table.

## Prod-bypass procedure

Some migrations retrofit a column that already exists in prod (because earlier code paths wrote to it without the schema being captured in a migration). When this happens, applying the migration to prod will fail with `duplicate column name`. The fix is to mark the migration as applied in the Wrangler ledger without actually running it, so future fresh environments still get the column and the ledger stays consistent.

### Steps

1. Verify the column already exists in prod:

   ```sh
   pnpm exec wrangler d1 execute reduced-recipes-prod --remote \
     --config packages/workers/wrangler.api.toml \
     --command "PRAGMA table_info(<table>);"
   ```

2. Identify the Wrangler ledger table name. The exact name and columns may vary by Wrangler version, so check before relying on a hardcoded name:

   ```sh
   pnpm exec wrangler d1 execute reduced-recipes-prod --remote \
     --config packages/workers/wrangler.api.toml \
     --command "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%migration%';"
   ```

   At time of writing the table is `d1_migrations` with columns `(name, applied_at)`.

3. Insert a row marking the migration as applied:

   ```sh
   pnpm exec wrangler d1 execute reduced-recipes-prod --remote \
     --config packages/workers/wrangler.api.toml \
     --command "INSERT INTO d1_migrations (name, applied_at) VALUES ('0013_recipes_original_language.sql', strftime('%s','now'));"
   ```

4. Confirm the migration is no longer pending:

   ```sh
   pnpm exec wrangler d1 migrations list reduced-recipes-prod --remote \
     --config packages/workers/wrangler.api.toml
   ```

### When to use this

- The column or index in the migration already exists in prod from undocumented earlier work.
- The migration is purely additive (add column, add index with `IF NOT EXISTS`) so a fresh DB will pick it up correctly.

### When NOT to use this

- The migration changes data, drops or renames anything, or alters a constraint. In those cases write a corrective migration that handles both states explicitly.

## Migration log

| File | Notes |
|------|-------|
| `0013_recipes_original_language.sql` | Codifies a column that already exists in prod. Use the prod-bypass procedure above. |
