# Ideas Backlog

Parking lot for product ideas that aren't yet on the roadmap. Each entry is enough context to revive the idea later without re-brainstorming from scratch.

When an idea graduates, move it into its own `spec/*.md` document and delete the entry here.

---

## Cook mode + servings scaling + unit toggle

**One-liner:** Focused cooking view (wake-lock, large type, swipe between steps, per-step auto-detected timers) plus live servings scaler and metric/imperial toggle.

**Why:** This is where the "clean, useful, anti-bloat" brand promise becomes a felt experience at the stove. Strongest mobile differentiator.

**Sketch:**
- New routes: `packages/frontend/src/routes/recipe/[id]/cook.tsx`, `packages/mobile/src/app/recipe/[id]/cook.tsx`
- Pure scaling helpers in `packages/shared/src/scale.ts` reusing `unit-normalisation`
- Timer extractor `packages/shared/src/extract-timers.ts` with regex like `/(\d+)(?:\s*to\s*\d+)?\s*(min|sec|hr)/i`
- Persist `units` preference in `USER_CACHE_KV` for signed-in users
- Mobile uses `expo-keep-awake` and Reanimated for swipe

**Watch out:** Many quantities are non-numeric ("a pinch"). Pass through unchanged. Accessibility: ≥18pt body, contrast-tested, respect `prefers-reduced-motion`.

**Effort:** M · **Impact:** High

---

## Source-diversified search

**One-liner:** Re-rank pass that caps results-per-domain so a search returns recipes from many sources instead of nine from the same blog.

**Why:** Better discovery, surfaces smaller publishers, reinforces that we're an index rather than a single voice.

**Sketch:**
- Add `diversify(results, maxPerDomain = 2)` after FTS+vector fusion in `rr-api`
- Tunable per-route; default 2 for general search, 1 for trending
- Tiny PR, no schema changes

**Effort:** S · **Impact:** Medium

---

## "Find the original" — duplicate cluster view

**One-liner:** When a recipe is republished across many sites, show a cluster with the earliest known publication highlighted.

**Why:** Makes the attribution mission visible. A unique angle no aggregator does.

**Sketch:**
- Use existing Vectorize embeddings to cluster near-duplicates offline (new cron `rr-cluster`)
- Add `cluster_id` and `first_seen_at` columns on `recipes`, backfill in batches
- New endpoint `GET /recipes/:id/related-versions`
- UI: small "appears in N places, earliest: source X" line on recipe page

**Watch out:** Clustering threshold tuning. Set a confidence floor and only expose clusters above it. False positives erode trust.

**Effort:** L · **Impact:** Medium

---

## Cached ingredient substitution helper (Workers AI)

**One-liner:** Tap an ingredient to get safe substitutions with quantity-corrected ratios (e.g. "¾ cup buttermilk → ¾ cup milk + ¾ tsp lemon juice").

**Why:** Highest-friction real-world cooking moment. Keeps users on-page instead of Googling.

**Sketch:**
- Llama 3.1 with JSON-schema-constrained prompt
- Cache in `CACHE_KV` keyed by `(canonical_ingredient, dietary_constraints)` so warm-up amortises cost to ~zero
- UI: long-press ingredient on mobile, click on web

**Watch out:** Hallucinated ratios. Constrain output schema and reject low-confidence suggestions.

**Effort:** S · **Impact:** Medium

---

## Personal cookbook PDF (collection export)

**One-liner:** Export a collection (Phase 1b) as a print-ready PDF with editorial layout and source attribution on every page.

**Why:** The "I bought hundreds of cookbooks to avoid online recipes" founder story, productised. Strong word-of-mouth artifact.

**Sketch:**
- Worker route `POST /collections/:id/export.pdf`
- Cloudflare Container running headless Chromium + print stylesheet mirroring specimen-label aesthetic
- Mobile share-sheet integration

**Dependencies:** Phase 1b Collections must ship first.

**Effort:** M · **Impact:** Medium

---

## Plain-text / markdown copy button

**One-liner:** One-click copy of a recipe as clean markdown or plain text, with attribution footer.

**Why:** The clearest possible signal of the project's identity. Costs nothing, gets shared in DMs and Discord.

**Sketch:**
- Client-side serialiser from `RecipeDocument` → markdown
- One button on recipe page
- Add `og:recipe` JSON-LD echo on SSR pages so the source HTML is also paste-clean

**Effort:** S · **Impact:** Medium

---

## Made-it journal (private cooking history)

**One-liner:** One-tap "made it" with optional one-line private note. Browsable history. No stars, no public reviews.

**Why:** Public reviews and ratings (Phase 3) carry engagement-trap risk. A private journal gives users the real value (remembering what worked) without the social-media gravity well. Consider this as an alternative or complement to Phase 3.

**Sketch:**
- New table `user_cooked (user_id, recipe_id, cooked_at, note)`
- Endpoints `POST /me/cooked`, `GET /me/cooked`
- Mobile-first UI; iOS/Android widget candidate later

**Dependencies:** Auth (live).

**Effort:** S · **Impact:** Medium
