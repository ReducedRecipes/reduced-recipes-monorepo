/**
 * Vector backfill script for ReducedRecipes.
 *
 * Reads all recipe IDs from D1 in batches, fetches their full documents from
 * RECIPES_KV, generates embeddings via Workers AI, and upserts them into the
 * Vectorize index.
 *
 * Progress is tracked via a `vector_backfill_cursor` key in RECIPES_KV so
 * the script can be safely interrupted and resumed.
 *
 * Usage:
 *   npx wrangler dev --test-scheduled   (run in a scheduled Worker context)
 *   npx tsx scripts/backfill-vectors.ts  (local dry-run — skips wrangler calls)
 *
 * Environment variables (wrangler secrets / vars):
 *   DB             — D1 database binding
 *   RECIPES_KV     — KV namespace binding
 *   AI             — Workers AI binding
 *   VECTORIZE      — Vectorize index binding
 */

import { execSync } from "node:child_process";
import type { RecipeDocument } from "@rr/shared";

/** Embedding model — 768 dimensions, best multilingual retrieval quality. */
export const EMBEDDING_MODEL = "@cf/google/embeddinggemma-300m";

/** Vectorize supports up to 1000 vectors per insert call. */
export const VECTORIZE_BATCH_SIZE = 1_000;

/** KV key used to store the backfill cursor (D1 row offset). */
export const CURSOR_KEY = "vector_backfill_cursor";

/** Number of recipe IDs fetched from D1 per iteration. */
export const D1_PAGE_SIZE = 1_000;

/** Max concurrent AI embedding calls per batch (stay within rate limits). */
export const AI_CONCURRENCY = 10;

/** Minimum similarity threshold stored as metadata (informational). */
export const MIN_SIMILARITY = 0.65;

export interface RecipeRow {
  id: string;
  domain: string;
  dietary_bitmask: number | null;
  total_time: number | null;
}

export interface VectorRecord {
  id: string;
  values: number[];
  metadata: {
    recipe_id: string;
    domain: string;
    dietary_bitmask: number;
    total_time: number;
  };
}

/**
 * Build the embedding input text for a recipe.
 *
 * Format: `{title} | {cuisine} | {category} | {ingredient_1}, {ingredient_2}, ...`
 *
 * Pipe-delimited fields give the model clear boundaries while keeping
 * ingredients discoverable for "what can I make with X" queries.
 */
export function buildEmbeddingText(doc: RecipeDocument): string {
  const parts: string[] = [doc.title];
  if (doc.cuisine) parts.push(doc.cuisine);
  if (doc.category) parts.push(doc.category);
  if (doc.ingredients.length > 0) parts.push(doc.ingredients.join(", "));
  return parts.join(" | ");
}

/**
 * Assemble a VectorRecord from a recipe row + its embedding values.
 */
export function buildVectorRecord(
  row: RecipeRow,
  values: number[]
): VectorRecord {
  return {
    id: row.id,
    values,
    metadata: {
      recipe_id: row.id,
      domain: row.domain,
      dietary_bitmask: row.dietary_bitmask ?? 0,
      total_time: row.total_time ?? 0,
    },
  };
}

// ─── Wrangler-based helpers (skipped in unit tests) ──────────────────────────

function wranglerExec(command: string): string {
  return execSync(command, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
}

/**
 * Fetch a page of recipe rows from D1 via wrangler CLI.
 */
export function fetchRecipeRowsFromD1(offset: number, limit: number): RecipeRow[] {
  const sql = `SELECT id, domain, dietary_bitmask, total_time FROM recipes ORDER BY id LIMIT ${limit} OFFSET ${offset}`;
  const raw = wranglerExec(
    `npx wrangler d1 execute reduced-recipes-prod --command="${sql.replace(/"/g, '\\"')}" --json`
  );
  const parsed = JSON.parse(raw);
  // wrangler returns an array of result objects; take the first result's rows
  const results = Array.isArray(parsed) ? parsed[0] : parsed;
  return (results?.results ?? []) as RecipeRow[];
}

/**
 * Fetch the backfill cursor (current offset) from RECIPES_KV.
 */
export function fetchCursorFromKV(): number {
  try {
    const raw = wranglerExec(
      `npx wrangler kv key get --binding=RECIPES_KV "${CURSOR_KEY}"`
    ).trim();
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Persist the backfill cursor to RECIPES_KV.
 */
export function saveCursorToKV(offset: number): void {
  wranglerExec(
    `npx wrangler kv key put --binding=RECIPES_KV "${CURSOR_KEY}" "${offset}"`
  );
}

/**
 * Fetch a recipe document from RECIPES_KV.
 * Returns null if the key is missing (recipe may not have been parsed yet).
 */
export function fetchDocFromKV(recipeId: string): RecipeDocument | null {
  try {
    const raw = wranglerExec(
      `npx wrangler kv key get --binding=RECIPES_KV "recipe:${recipeId}"`
    ).trim();
    if (!raw || raw === "null") return null;
    return JSON.parse(raw) as RecipeDocument;
  } catch {
    return null;
  }
}

/**
 * Embed a batch of texts via Workers AI (using wrangler JSON API).
 * Returns an array of embedding vectors (one per input text).
 */
export function embedTexts(texts: string[]): number[][] {
  const input = JSON.stringify({ text: texts });
  const raw = wranglerExec(
    `npx wrangler ai run ${EMBEDDING_MODEL} --json '${input.replace(/'/g, "'\\''")}'`
  );
  const result = JSON.parse(raw) as { data?: number[][] };
  if (!result.data || result.data.length !== texts.length) {
    throw new Error(`Unexpected AI response: ${raw.slice(0, 200)}`);
  }
  return result.data;
}

/**
 * Upsert a batch of vectors into Vectorize via wrangler CLI.
 */
export function upsertVectors(vectors: VectorRecord[]): void {
  const ndjson = vectors
    .map((v) => JSON.stringify({ id: v.id, values: v.values, metadata: v.metadata }))
    .join("\n");
  wranglerExec(
    `echo '${ndjson.replace(/'/g, "'\\''")}' | npx wrangler vectorize insert rr-recipes --batch-size=${VECTORIZE_BATCH_SIZE}`
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Vector Backfill Script ===");
  console.log(`Model: ${EMBEDDING_MODEL}`);
  console.log(`D1 page size: ${D1_PAGE_SIZE}`);
  console.log(`Vectorize batch size: ${VECTORIZE_BATCH_SIZE}`);
  console.log();

  let offset = fetchCursorFromKV();
  console.log(`Resuming from offset: ${offset}`);

  let totalIndexed = 0;

  while (true) {
    // 1. Fetch a page of recipe IDs from D1
    console.log(`\nFetching rows ${offset}–${offset + D1_PAGE_SIZE - 1} from D1...`);
    const rows = fetchRecipeRowsFromD1(offset, D1_PAGE_SIZE);

    if (rows.length === 0) {
      console.log("No more rows — backfill complete.");
      break;
    }

    // 2. Fetch docs from KV (in sub-batches of AI_CONCURRENCY)
    const vectors: VectorRecord[] = [];

    for (let i = 0; i < rows.length; i += AI_CONCURRENCY) {
      const chunk = rows.slice(i, i + AI_CONCURRENCY);

      // Fetch docs
      const docs = chunk.map((row) => fetchDocFromKV(row.id));

      // Build embedding texts for rows that have docs
      const validPairs: Array<{ row: RecipeRow; text: string }> = [];
      for (let j = 0; j < chunk.length; j++) {
        const doc = docs[j];
        if (doc) {
          validPairs.push({ row: chunk[j], text: buildEmbeddingText(doc) });
        } else {
          console.warn(`  [skip] No KV doc for recipe ${chunk[j].id}`);
        }
      }

      if (validPairs.length === 0) continue;

      // Embed
      try {
        const embeddings = embedTexts(validPairs.map((p) => p.text));
        for (let k = 0; k < validPairs.length; k++) {
          vectors.push(buildVectorRecord(validPairs[k].row, embeddings[k]));
        }
        process.stdout.write(`  embedded ${i + chunk.length}/${rows.length}\r`);
      } catch (err) {
        console.error(`  [error] Embedding failed for chunk at ${i}:`, err);
        // Continue — remaining rows in this page will still be processed
      }
    }

    // 3. Upsert to Vectorize (in batches of VECTORIZE_BATCH_SIZE)
    for (let i = 0; i < vectors.length; i += VECTORIZE_BATCH_SIZE) {
      const batch = vectors.slice(i, i + VECTORIZE_BATCH_SIZE);
      console.log(`\n  Upserting ${batch.length} vectors to Vectorize...`);
      upsertVectors(batch);
    }

    totalIndexed += vectors.length;

    // 4. Advance cursor
    offset += rows.length;
    saveCursorToKV(offset);

    console.log(`  Page done. Total indexed so far: ${totalIndexed}. Cursor: ${offset}`);

    if (rows.length < D1_PAGE_SIZE) {
      console.log("Last page reached — backfill complete.");
      break;
    }
  }

  console.log(`\nBackfill finished. Total vectors indexed: ${totalIndexed}`);
}

// Only run main() when executed directly (not when imported by tests)
if (process.argv[1] === import.meta.url.replace("file://", "")) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
