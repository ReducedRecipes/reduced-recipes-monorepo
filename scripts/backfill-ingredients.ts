/**
 * Backfill ingredient index by reading recipes from KV and inserting
 * into recipe_ingredients + ingredients tables via D1.
 *
 * Usage: npx tsx scripts/backfill-ingredients.ts
 *
 * Requires: wrangler login (uses wrangler CLI under the hood)
 */
import { execSync } from "child_process";
import { extractIngredientNames } from "../packages/workers/src/helpers/ingredient-extract";

const WRANGLER_CONFIG = "packages/workers/wrangler.api.toml";
const DB_NAME = "reduced-recipes-prod";
const BATCH_SIZE = 100;

function wranglerKvList(cursor?: string): { keys: { name: string }[]; list_complete: boolean; cursor: string } {
  const args = [`wrangler kv key list --binding RECIPES_KV --config ${WRANGLER_CONFIG} --remote`];
  if (cursor) args.push(`--cursor "${cursor}"`);
  const result = execSync(`npx ${args.join(" ")}`, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  // wrangler outputs JSON array of keys, plus cursor info in stderr
  const keys = JSON.parse(result);
  return {
    keys: keys.filter((k: { name: string }) => k.name.startsWith("recipe:")),
    list_complete: keys.length < 1000,
    cursor: "",
  };
}

function wranglerKvGet(key: string): string | null {
  try {
    return execSync(
      `npx wrangler kv key get "${key}" --binding RECIPES_KV --config ${WRANGLER_CONFIG} --remote`,
      { encoding: "utf-8", maxBuffer: 10 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
    );
  } catch {
    return null;
  }
}

function wranglerD1Execute(sql: string): void {
  execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --config ${WRANGLER_CONFIG} --command "${sql.replace(/"/g, '\\"')}"`,
    { stdio: ["pipe", "pipe", "pipe"] },
  );
}

async function main() {
  // Get all recipe IDs from D1 (faster than listing KV)
  console.log("Fetching recipe IDs from D1...");
  const idResult = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --config ${WRANGLER_CONFIG} --json --command "SELECT id FROM recipes"`,
    { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(idResult);
  const allIds: string[] = parsed[0].results.map((r: { id: string }) => r.id);
  console.log(`Found ${allIds.length} recipes in D1`);

  // Check which are already indexed
  const indexedResult = execSync(
    `npx wrangler d1 execute ${DB_NAME} --remote --config ${WRANGLER_CONFIG} --json --command "SELECT DISTINCT recipe_id FROM recipe_ingredients"`,
    { encoding: "utf-8", maxBuffer: 100 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] },
  );
  const indexedParsed = JSON.parse(indexedResult);
  const indexed = new Set<string>(indexedParsed[0].results.map((r: { recipe_id: string }) => r.recipe_id));
  console.log(`Already indexed: ${indexed.size}`);

  const toIndex = allIds.filter((id) => !indexed.has(id));
  console.log(`Need to index: ${toIndex.length}`);

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < toIndex.length; i += BATCH_SIZE) {
    const batch = toIndex.slice(i, i + BATCH_SIZE);
    const sqlParts: string[] = [];

    for (const id of batch) {
      try {
        const kvValue = wranglerKvGet(`recipe:${id}`);
        if (!kvValue) { failed++; continue; }

        const doc = JSON.parse(kvValue);
        if (!doc.ingredients || doc.ingredients.length === 0) { continue; }

        const names = extractIngredientNames(doc.ingredients);
        if (names.length === 0) { continue; }

        for (const name of names) {
          const escaped = name.replace(/'/g, "''");
          sqlParts.push(`INSERT OR IGNORE INTO ingredients (name, count) VALUES ('${escaped}', 0)`);
          sqlParts.push(`INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient) VALUES ('${id}', '${escaped}')`);
        }

        processed++;
      } catch (e) {
        failed++;
      }
    }

    if (sqlParts.length > 0) {
      // D1 has a limit on command length, so chunk the SQL
      const chunkSize = 50;
      for (let j = 0; j < sqlParts.length; j += chunkSize) {
        const chunk = sqlParts.slice(j, j + chunkSize);
        try {
          wranglerD1Execute(chunk.join("; "));
        } catch (e) {
          console.error(`SQL batch failed at offset ${j}:`, (e as Error).message?.slice(0, 200));
        }
      }
    }

    console.log(`Progress: ${Math.min(i + BATCH_SIZE, toIndex.length)}/${toIndex.length} (${processed} ok, ${failed} failed)`);
  }

  // Update counts
  console.log("Updating ingredient counts...");
  try {
    wranglerD1Execute("UPDATE ingredients SET count = (SELECT COUNT(*) FROM recipe_ingredients WHERE ingredient = ingredients.name)");
  } catch (e) {
    console.error("Count update failed:", (e as Error).message?.slice(0, 200));
  }

  console.log(`Done! Processed: ${processed}, Failed: ${failed}`);
}

main().catch(console.error);
