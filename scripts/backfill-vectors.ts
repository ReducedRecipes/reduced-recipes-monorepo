/**
 * Vector backfill script for Reduced Recipes.
 *
 * Reads all recipe IDs from D1, fetches the full RecipeDocument from
 * RECIPES_KV via the Cloudflare REST API, generates an embedding via
 * Workers AI (@cf/google/embeddinggemma-300m), and upserts it to the
 * Vectorize index in batches.
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=<id> CLOUDFLARE_API_TOKEN=<token> \
 *     pnpm tsx scripts/backfill-vectors.ts
 *
 * Environment variables:
 *   CLOUDFLARE_ACCOUNT_ID  — CF account ID (required)
 *   CLOUDFLARE_API_TOKEN   — CF API token with Workers AI + Vectorize + KV read (required)
 *   KV_NAMESPACE_ID        — RECIPES_KV namespace ID (default: 1ca521a6b82b499b802318ee8bf747db)
 *   VECTORIZE_INDEX        — Vectorize index name (default: recipe-embeddings)
 *   D1_DATABASE            — D1 database name passed to wrangler (default: reduced-recipes-prod)
 *
 * Optional flags:
 *   --dry-run    Print what would be done without writing to Vectorize
 *   --batch=N    Recipes per Vectorize upsert batch (default: 100, max: 1000)
 *   --limit=N    Stop after N recipes (useful for smoke-testing)
 */

import { execSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKERS_DIR = resolve(SCRIPT_DIR, "../packages/workers");

// ── Types ─────────────────────────────────────────────────────────────────────

interface RecipeDocument {
  id: string;
  title: string;
  domain: string;
  ingredients: string[];
  tags: string[];
  cuisine: string | null;
  category: string | null;
  [key: string]: unknown;
}

interface VectorizeVector {
  id: string;
  values: number[];
  metadata: { title: string; domain: string };
}

interface D1QueryRow {
  id: string;
}

// ── Pure helpers (exported for testing) ───────────────────────────────────────

/**
 * Build the text string that will be embedded for a recipe.
 * Combines the fields most relevant for semantic search including nutrition.
 */
export function buildEmbeddingText(doc: RecipeDocument): string {
  const parts: string[] = [doc.title];
  if (doc.cuisine) parts.push(doc.cuisine);
  if (doc.category) parts.push(doc.category);
  if (doc.ingredients.length > 0) parts.push(doc.ingredients.join(", "));

  // Include nutrition for queries like "high protein", "low calorie"
  const n = doc.nutrition as { calories?: number | null; protein_g?: number | null; fat_g?: number | null; carbs_g?: number | null; fiber_g?: number | null } | undefined;
  if (n) {
    const np: string[] = [];
    if (n.calories != null) np.push(`${n.calories} calories`);
    if (n.protein_g != null) np.push(`${n.protein_g}g protein`);
    if (n.fat_g != null) np.push(`${n.fat_g}g fat`);
    if (n.carbs_g != null) np.push(`${n.carbs_g}g carbs`);
    if (n.fiber_g != null) np.push(`${n.fiber_g}g fiber`);
    if (np.length > 0) parts.push(np.join(", "));
  }

  return parts.join(" | ").replace(/\s+/g, " ").trim();
}

/**
 * Parse the JSON output produced by `wrangler d1 execute --json`.
 * Returns an array of recipe IDs.
 */
export function parseD1Result(raw: string): string[] {
  // wrangler outputs an array of statement results, e.g.:
  // [{"results": [{"id": "abc"}, ...], "success": true, "meta": {...}}]
  const parsed = JSON.parse(raw) as Array<{ results?: D1QueryRow[] }>;
  const first = parsed[0];
  if (!first?.results) return [];
  return first.results.map((row) => row.id).filter(Boolean);
}

/**
 * Split an array into chunks of at most `size` elements.
 */
export function batchChunks<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// ── Config ────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";

const ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
const KV_NAMESPACE_ID = process.env.KV_NAMESPACE_ID ?? "1ca521a6b82b499b802318ee8bf747db";
const VECTORIZE_INDEX = process.env.VECTORIZE_INDEX ?? "rr-recipes";
const D1_DATABASE = process.env.D1_DATABASE ?? "reduced-recipes-prod";

// Use explicit API token if provided, otherwise read wrangler's OAuth token
function resolveApiToken(): string {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  try {
    const toml = readFileSync(resolve(process.env.HOME ?? "", "Library/Preferences/.wrangler/config/default.toml"), "utf-8");
    const match = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
    if (match?.[1]) return match[1];
  } catch { /* ignore */ }
  return "";
}
const API_TOKEN = resolveApiToken();

const AI_MODEL = "@cf/google/embeddinggemma-300m";
const CF_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}`;

// ── API helpers ───────────────────────────────────────────────────────────────

async function cfFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`CF API ${res.status} ${path}: ${body}`);
  }
  return res.json();
}

/** Fetch a single recipe document from RECIPES_KV. Returns null if not found. */
async function fetchRecipeDoc(recipeId: string): Promise<RecipeDocument | null> {
  const key = `recipe:${recipeId}`;
  const res = await fetch(
    `${CF_BASE}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
    { headers: { Authorization: `Bearer ${API_TOKEN}` } },
  );
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`KV fetch ${res.status} for ${key}: ${await res.text()}`);
  }
  return res.json() as Promise<RecipeDocument>;
}

/** Generate embeddings for a batch of texts. Returns parallel array of float arrays. */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const result = await cfFetch(`/ai/run/${AI_MODEL}`, {
    method: "POST",
    body: JSON.stringify({ text: texts }),
  }) as { result?: { data?: number[][] } };
  const data = result?.result?.data;
  if (!Array.isArray(data) || data.length !== texts.length) {
    throw new Error(`Unexpected AI response shape: ${JSON.stringify(result)}`);
  }
  return data;
}

/** Upsert a batch of vectors to Vectorize. */
async function upsertVectors(vectors: VectorizeVector[]): Promise<void> {
  // Vectorize upsert accepts NDJSON
  const ndjson = vectors.map((v) => JSON.stringify(v)).join("\n");
  const res = await fetch(`${CF_BASE}/vectorize/v2/indexes/${VECTORIZE_INDEX}/upsert`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/x-ndjson",
    },
    body: ndjson,
  });
  if (!res.ok) {
    throw new Error(`Vectorize upsert ${res.status}: ${await res.text()}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const batchArg = args.find((a) => a.startsWith("--batch="));
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const offsetArg = args.find((a) => a.startsWith("--offset="));
  const batchSize = batchArg ? Math.min(parseInt(batchArg.split("=")[1]!, 10), 1000) : 100;
  const limit = limitArg ? parseInt(limitArg.split("=")[1]!, 10) : Infinity;
  const startOffset = offsetArg ? parseInt(offsetArg.split("=")[1]!, 10) : 0;

  if (!ACCOUNT_ID || !API_TOKEN) {
    console.error("Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set.");
    process.exit(1);
  }

  console.log(`Backfill config:`);
  console.log(`  D1 database   : ${D1_DATABASE}`);
  console.log(`  KV namespace  : ${KV_NAMESPACE_ID}`);
  console.log(`  Vectorize idx : ${VECTORIZE_INDEX}`);
  console.log(`  AI model      : ${AI_MODEL}`);
  console.log(`  Batch size    : ${batchSize}`);
  console.log(`  Limit         : ${isFinite(limit) ? limit : "none"}`);
  console.log(`  Offset        : ${startOffset}`);
  console.log(`  Dry run       : ${dryRun}`);
  console.log();

  // ── Step 1: fetch recipe IDs from D1 (paginated to avoid timeout) ──
  console.log("Fetching recipe IDs from D1...");
  const fetchCount = isFinite(limit) ? startOffset + limit : 200_000;
  const wranglerEnv = { ...process.env };
  delete wranglerEnv.CLOUDFLARE_API_TOKEN; // Use OAuth for D1
  let d1Raw: string;
  try {
    d1Raw = execSync(
      `npx wrangler d1 execute ${D1_DATABASE} --remote --json --config wrangler.api.toml --command "SELECT id FROM recipes ORDER BY id LIMIT ${fetchCount}"`,
      { encoding: "utf-8", cwd: WORKERS_DIR, maxBuffer: 200 * 1024 * 1024, timeout: 180_000, env: wranglerEnv },
    );
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    if (e.stdout && e.stdout.trim().startsWith("[")) {
      d1Raw = e.stdout;
    } else {
      console.error("stderr:", e.stderr?.slice(0, 500));
      console.error("stdout:", e.stdout?.slice(0, 500));
      throw new Error(`D1 query failed (exit ${e.status})`);
    }
  }
  const allIds = parseD1Result(d1Raw);
  const ids = allIds.slice(startOffset, isFinite(limit) ? startOffset + limit : undefined);
  console.log(`  Total in DB: ${allIds.length}, skipping ${startOffset}, processing ${ids.length}.`);
  console.log();

  // ── Step 2-4: fetch docs, embed, upsert — in batches ──────────────────────
  const batches = batchChunks(ids, batchSize);
  let processed = 0;
  let skipped = 0;

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx]!;
    console.log(`Batch ${batchIdx + 1}/${batches.length} (${batch.length} recipes)...`);

    // Step 2: fetch docs from KV
    const docResults = await Promise.all(batch.map((id) => fetchRecipeDoc(id)));
    const docs: RecipeDocument[] = [];
    const docIds: string[] = [];
    for (let i = 0; i < batch.length; i++) {
      const doc = docResults[i];
      if (!doc) {
        console.warn(`  Skipping ${batch[i]} — not found in KV`);
        skipped++;
        continue;
      }
      docs.push(doc);
      docIds.push(batch[i]!);
    }

    if (docs.length === 0) continue;

    // Step 3: generate embeddings
    const texts = docs.map(buildEmbeddingText);
    let embeddings: number[][];
    if (dryRun) {
      console.log(`  [dry-run] Would embed ${docs.length} texts.`);
      embeddings = docs.map(() => new Array(768).fill(0) as number[]);
    } else {
      embeddings = await generateEmbeddings(texts);
    }

    // Step 4: upsert to Vectorize
    const vectors: VectorizeVector[] = docs.map((doc, i) => ({
      id: docIds[i]!,
      values: embeddings[i]!,
      metadata: { title: doc.title, domain: doc.domain },
    }));

    if (dryRun) {
      console.log(`  [dry-run] Would upsert ${vectors.length} vectors.`);
      for (const v of vectors.slice(0, 3)) {
        console.log(`    ${v.id}: "${v.metadata.title.slice(0, 60)}"`);
      }
      if (vectors.length > 3) console.log(`    ... and ${vectors.length - 3} more`);
    } else {
      await upsertVectors(vectors);
      console.log(`  Upserted ${vectors.length} vectors.`);
    }

    processed += docs.length;

    // Brief pause between batches to avoid rate-limiting
    if (batchIdx < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  console.log();
  console.log(`Done. Processed: ${processed}, Skipped (not in KV): ${skipped}`);
}

// Only run when executed directly, not when imported by tests
if (!process.env.VITEST) {
  main().catch((err: unknown) => {
    console.error("Fatal:", (err as Error).message ?? err);
    process.exit(1);
  });
}
