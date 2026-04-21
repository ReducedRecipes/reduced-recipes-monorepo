# ReducedRecipes — Semantic Vector Search

**Version:** 1.0
**Date:** 2026-04-21
**Status:** Draft
**Cost:** ~$0.06/month storage (167K recipes) — embedding cost TBC (EmbeddingGemma pricing not yet published, may be free during beta)

---

## Overview

Add semantic search powered by Cloudflare Vectorize and Workers AI embeddings. Users can search by natural language intent ("quick weeknight pasta", "creamy soup without dairy", "something with leftover chicken") instead of exact keyword matches. Vector search runs alongside the existing FTS index — keyword search remains the default, with semantic results as a secondary signal or explicit mode.

---

## Why

The current search uses D1 FTS5 (`recipes_fts MATCH`), which is fast and good for exact terms but fails on:

- **Intent queries:** "easy dinner for two" matches nothing — no recipe has those exact words indexed
- **Synonym gaps:** "aubergine" won't find "eggplant" recipes
- **Conversational queries:** "what can I make with rice and chicken" returns noise
- **Cross-field meaning:** a user searching "italian fish" needs semantic understanding, not just recipes where both words appear in the title

Vector search solves these by comparing meaning rather than tokens.

---

## Architecture

### Embedding Model

**`@cf/google/embeddinggemma-300m`** (768 dimensions)

- Best-in-class retrieval quality for its size (~0.834 NDCG@10 vs 0.754 for bge-base)
- 308M parameters, 768-dim output (same as bge-base, so Vectorize storage cost is identical)
- Supports 100+ languages natively — handles untranslated recipes (e.g. archanaskitchen.com) without needing translation first
- Matryoshka support — can truncate to 512/256/128 dims if we need to optimize storage later
- Pricing not yet published on Cloudflare (may still be in beta/free tier); fallback to `@cf/baai/bge-base-en-v1.5` ($0.067/M tokens) if needed

### Storage

**Cloudflare Vectorize** index named `recipe-embeddings`

- Metric: `cosine` (standard for text embeddings)
- Dimensions: 768
- Stored dimensions: 167K × 768 = ~128M → $0.06/month overage above the 10M included

### Embedding Input

Each recipe is embedded as a single text string:

```
{title} | {cuisine} | {category} | {ingredient_1}, {ingredient_2}, ...
```

Example:
```
Spaghetti Carbonara | Italian | Pasta | spaghetti, guanciale, eggs, pecorino romano, black pepper
```

Rationale:
- Title carries the most weight (appears first, model attention)
- Cuisine/category add semantic context ("Italian" clusters with other Italian recipes)
- Ingredients enable "what can I make with X" queries
- Pipe-delimited to give the model clear field boundaries
- Instructions are excluded — too long, too noisy, and not what users search for

### Vector Metadata

Each vector stores metadata for filtering:

```json
{
  "recipe_id": "abc123",
  "domain": "simplyrecipes.com",
  "dietary_bitmask": 5,
  "total_time": 30
}
```

This enables pre-filtering on dietary restrictions and cook time at the Vectorize level, before results are returned.

---

## Data Flow

### At Projection Time (new recipes)

```
projection worker receives recipe
  → build embedding text: "{title} | {cuisine} | {category} | {ingredients...}"
  → call AI.run('@cf/google/embeddinggemma-300m', { text: [embeddingText] })
  → call VECTORIZE.insert([{ id: recipe_id, values: embedding, metadata }])
```

This happens after the D1 insert and dietary inference, as a best-effort step (failure doesn't block the recipe from being stored).

### At Search Time

```
GET /api/v1/search?q=pasta+mushrooms+no+tomato&mode=semantic

  → parse query for exclusions: include=["pasta", "mushrooms"], exclude=["tomato"]
  → embed only the include terms: "pasta mushrooms"
  → VECTORIZE.query(queryVector, { topK: 50, filter: { dietary_bitmask: ... } })
  → if exclusions present:
      → SELECT recipe_id FROM recipe_ingredients
         WHERE recipe_id IN (...candidate_ids...)
         AND ingredient LIKE '%tomato%'
      → remove matched IDs from results
  → fetch recipe summaries from D1 by remaining IDs (top 24)
  → return results
```

### Query Parsing (Exclusion Detection)

The API parses natural-language exclusions before embedding. Supported patterns:

| User writes | Parsed as |
|-------------|-----------|
| `pasta mushrooms no tomato` | include: "pasta mushrooms", exclude: ["tomato"] |
| `pasta mushrooms -tomato` | include: "pasta mushrooms", exclude: ["tomato"] |
| `pasta without cream or cheese` | include: "pasta", exclude: ["cream", "cheese"] |
| `pasta mushrooms but not tomato sauce` | include: "pasta mushrooms", exclude: ["tomato sauce"] |
| `chicken curry no coconut` | include: "chicken curry", exclude: ["coconut"] |

Parsing rules:
1. Split on `no `, `not `, `without `, `but no `, `but not `, `but without `, or `-` prefix
2. Everything before the split is the include query (sent to embedding)
3. Everything after is a comma/`or`-separated exclusion list
4. Exclusions are matched against the `recipe_ingredients` table using `LIKE '%term%'`
5. Over-fetch from Vectorize (`topK: 50`) to account for excluded results being removed

This leverages the existing `recipe_ingredients` index — no new infrastructure needed for exclusions.

---

## API Changes

### `GET /api/v1/search`

New query parameters:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `"keyword" \| "semantic" \| "hybrid"` | `"keyword"` | Search strategy |
| `exclude` | `string` | — | Comma-separated ingredients to exclude (explicit alternative to natural-language parsing) |

**Mode behavior:**

- **`keyword`** (default) — existing FTS5 behavior, unchanged
- **`semantic`** — pure vector search, returns top-K by cosine similarity
- **`hybrid`** — runs both FTS and vector search, merges results with reciprocal rank fusion (RRF)

**Hybrid RRF formula:**

```
score(recipe) = sum(1 / (k + rank_in_source)) for each source where recipe appears
```

Where `k = 60` (standard RRF constant). Recipes appearing in both FTS and vector results rank highest.

**Response additions:**

```json
{
  "items": [...],
  "has_more": true,
  "search_mode": "hybrid"
}
```

### `GET /api/v1/search/by-ingredients` (enhanced)

The existing ingredient board endpoint gains a vector-powered mode. Currently it uses `LIKE '%mince%'` which only matches recipes containing that exact substring. With vector search, "mince meat" also surfaces recipes with "ground beef", "meatballs", "bolognese" etc.

New query parameter:

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `mode` | `"exact" \| "semantic"` | `"exact"` | Match strategy |

**`exact`** (default) — current behavior, LIKE matching against `recipe_ingredients`

**`semantic`** — builds an embedding from the `have` ingredients, queries Vectorize, then post-filters exclusions via D1:

```
GET /api/v1/search/by-ingredients?have=mince+meat,pasta&exclude=tomato&mode=semantic

  → embed: "mince meat, pasta"
  → VECTORIZE.query(queryVector, { topK: 50 })
  → exclude: SELECT recipe_id FROM recipe_ingredients
     WHERE recipe_id IN (...) AND ingredient LIKE '%tomato%'
  → fetch full ingredient lists for remaining IDs
  → compute match stats (have/missing) using fuzzy ingredient matching
  → return results sorted by fewest missing ingredients
```

The response shape stays identical — `items` with `match.have`, `match.total`, `match.missing`. The only difference is better recall: "mince" finds meatball recipes, "aubergine" finds eggplant recipes.

### `GET /api/v1/search/similar/{id}`

New endpoint — find recipes similar to a given recipe.

```
GET /api/v1/search/similar/abc123?limit=8
```

Returns the 8 most semantically similar recipes (excluding the source recipe). Useful for "More like this" on the recipe page.

---

## Infrastructure Changes

### Vectorize Index

Create via Wrangler CLI:

```bash
npx wrangler vectorize create recipe-embeddings \
  --dimensions=768 \
  --metric=cosine
```

### Wrangler Config Changes

**`wrangler.projection.toml`** — add Vectorize binding:

```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "recipe-embeddings"
```

**`wrangler.api.toml`** — add Vectorize + AI bindings:

```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "recipe-embeddings"
```

(AI binding already exists on both workers.)

### Env Type

Add to `packages/shared/src/env.ts`:

```typescript
/** Phase 3 bindings — vector search. */
VECTORIZE?: VectorizeIndex;
```

---

## Implementation Plan

### Phase 1: Index Pipeline

1. Add `VECTORIZE` binding to projection worker
2. Create `helpers/embed.ts` — builds embedding text from RecipeDocument, calls AI
3. After dietary inference in `projection.ts`, embed + insert vector (best-effort, try/catch)
4. New recipes are automatically indexed going forward

### Phase 2: Backfill

1. Create `scripts/backfill-vectors.ts` — reads all recipe IDs from D1, fetches docs from KV, embeds in batches of 100, upserts to Vectorize
2. Run via `wrangler dev` locally or as a one-off Cron Trigger
3. Track progress via a `vector_backfill_cursor` key in KV
4. Estimated time: ~167K recipes × ~50ms per embedding = ~2.3 hours (parallelizable)

### Phase 3: Search Endpoint

1. Add `VECTORIZE` binding to API worker
2. Add `mode` parameter to `GET /api/v1/search`
3. Implement semantic search path: embed query → vectorize.query → fetch D1 rows
4. Implement hybrid RRF merge
5. Add `/api/v1/search/similar/{id}` endpoint

### Phase 4: Frontend

1. Add search mode toggle to SearchPage (default: hybrid)
2. Add "More like this" shelf to RecipePage using similar endpoint
3. Update search bar placeholder to hint at natural language ("Try: quick weeknight pasta")

---

## Backfill Strategy

Vectorize supports batch inserts of up to 1,000 vectors at a time. The backfill script:

1. `SELECT id FROM recipes ORDER BY id LIMIT 1000 OFFSET ?`
2. For each batch, fetch full docs from `RECIPES_KV` (parallel `KV.get()`)
3. Build embedding texts, call `AI.run()` with batched inputs
4. `VECTORIZE.insert(vectors)` — 1,000 at a time
5. Repeat until all recipes are indexed
6. Store cursor in KV so the script can resume if interrupted

Rate limit: Workers AI embedding calls are cheap but have concurrency limits. Run at ~10 concurrent embedding calls to stay safe.

---

## Cost Model

### One-Time Backfill (167K recipes)

| Item | Calculation | Cost |
|------|-------------|------|
| Embedding generation | 167K recipes × ~100 tokens | TBC — EmbeddingGemma pricing not yet listed. If using bge-base fallback: ~$1.12 |
| Vectorize inserts | 167 batches × 1000 vectors | Free (included) |
| **Total** | | **~$0–$1.12** |

### Monthly Ongoing

| Item | Calculation | Cost |
|------|-------------|------|
| Storage | 128M dims − 10M included = 118M × $0.05/100M | ~$0.06 |
| New recipe embeddings | ~5K new/month × 100 tokens | TBC (negligible at bge-base rates: ~$0.03) |
| Search queries (10K/mo) | 10K × 768 dims = 7.7M (within 50M free) | $0.00 |
| **Total** | | **~$0.06–$0.09/month** |

### At Scale (1M recipes, 100K searches/month)

| Item | Calculation | Cost |
|------|-------------|------|
| Storage | 768M dims × $0.05/100M | ~$0.38 |
| Search queries | 100K × 768 = 76.8M dims (50M free + 26.8M overage) | ~$0.27 |
| **Total** | | **~$0.65/month** |

---

## Failure Modes & Mitigations

| Failure | Impact | Mitigation |
|---------|--------|------------|
| AI embedding call fails | Recipe not vector-indexed | Try/catch in projection, recipe still saved to D1/KV. Backfill script catches stragglers |
| Vectorize insert fails | Same as above | Same — best-effort, logged, backfill recovers |
| Vectorize query fails at search time | Semantic search unavailable | Fall back to keyword FTS, log the error |
| Embedding model changes/deprecated | Vectors become incompatible | Store model name in index metadata. Re-backfill if model changes |
| Query returns low-relevance results | Poor UX | Set minimum similarity threshold (e.g. 0.65), don't show results below it |

---

## Observability

- Log embedding latency per recipe in projection worker
- Log vector search latency vs FTS latency in API worker
- Track `search_mode` distribution in analytics (how often users use semantic vs keyword)
- Health endpoint: add `vector_index_count` field (via `VECTORIZE.describe()`)

---

## Open Questions

1. **Should hybrid be the default?** Start with keyword as default to avoid surprising existing users. Switch to hybrid once quality is validated.
2. **EmbeddingGemma pricing?** Not yet published on Cloudflare. If it's expensive or removed from beta, fall back to `bge-base-en-v1.5` — same dimensions, just lower retrieval quality. The Vectorize index doesn't need to change.
3. **Re-embedding on recipe update?** Currently recipes are INSERT OR IGNORE. If we add recipe updates, the embedding should be regenerated. For now, not needed.
4. **Matryoshka truncation?** EmbeddingGemma supports 512/256/128-dim truncation with minimal quality loss. If storage costs matter at scale (1M+ recipes), truncating to 512 dims would cut storage costs ~33% while keeping quality high.
