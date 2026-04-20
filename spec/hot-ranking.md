# ReducedRecipes — Hot Ranking & Popularity Algorithm

**Version:** 1.0
**Date:** 2026-04-20
**Status:** Draft
**Cost:** $0 (D1 queries only, no external services)

---

## Overview

A time-decaying popularity system inspired by Reddit's hot ranking algorithm. Recipes rise and fall based on recent engagement (hearts/favorites, shopping list adds, views). The homepage featured slot, trending shelves, and search results are all driven by this score.

---

## How It Works

### The Score Formula

```
hot_score = log10(max(|votes|, 1)) + (created_epoch / 45000)
```

Where:
- `votes` = net engagement signals (hearts, list adds) in a time window
- `created_epoch` = seconds since a fixed epoch (e.g. 2024-01-01)
- `45000` = decay constant (~12.5 hours). After 12.5 hours, a recipe needs 10x more votes to maintain the same rank

This means:
- A recipe with **10 votes in the last hour** beats a recipe with **100 votes from yesterday**
- The featured recipe on the homepage is always the current "hottest" recipe
- Rankings refresh naturally — no cron job needed, it's computed at query time

### Engagement Signals

Each action generates a weighted vote:

| Action | Weight | Rationale |
|--------|--------|-----------|
| Heart/favorite a recipe | **+1.0** | Explicit positive signal |
| Add recipe to shopping list | **+1.5** | Stronger intent — user plans to cook it |
| Un-heart a recipe | **-1.0** | Removes the positive signal |
| View recipe detail (authenticated) | **+0.1** | Weak signal, prevents gaming |
| View recipe detail (anonymous) | **+0.0** | Don't count anonymous views (too noisy) |

### Score Computation

Two approaches, depending on performance needs:

#### Option A: Real-time (computed at query time)

```sql
SELECT r.*,
  LOG10(MAX(COALESCE(v.vote_count, 0), 1)) +
  (CAST(strftime('%s', r.first_voted_at) AS REAL) - 1704067200) / 45000.0
  AS hot_score
FROM recipes r
LEFT JOIN recipe_vote_counts v ON v.recipe_id = r.id
ORDER BY hot_score DESC
LIMIT 24
```

**Pros:** Always fresh, no background jobs
**Cons:** Slower query on large tables

#### Option B: Materialized (pre-computed, refreshed periodically)

Store `hot_score` directly on the `recipes` table. A scheduled worker recomputes it every 5-15 minutes.

**Pros:** Fast reads, simple queries (`ORDER BY hot_score DESC`)
**Cons:** Slightly stale (5-15 min lag), needs a cron worker

**Recommendation:** Start with **Option B** — add a `hot_score` column and recompute on every vote + a periodic refresh. This keeps queries fast and the score reasonably fresh.

---

## Database Schema

### New column on `recipes` table (recipes DB)

```sql
ALTER TABLE recipes ADD COLUMN hot_score REAL DEFAULT 0;
ALTER TABLE recipes ADD COLUMN vote_count INTEGER DEFAULT 0;
ALTER TABLE recipes ADD COLUMN first_voted_at TEXT;

CREATE INDEX idx_recipes_hot ON recipes(hot_score DESC);
```

### New table: `recipe_votes` (users DB)

```sql
CREATE TABLE recipe_votes (
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id  TEXT NOT NULL,
  weight     REAL NOT NULL DEFAULT 1.0,
  action     TEXT NOT NULL,  -- 'heart', 'list_add', 'unheart'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id, action)
);

CREATE INDEX idx_rv_recipe ON recipe_votes(recipe_id);
CREATE INDEX idx_rv_created ON recipe_votes(created_at DESC);
```

### Aggregated counts synced to recipes DB

```sql
-- Materialized in recipes DB, updated on each vote
-- recipe_id → total weighted votes, first vote timestamp
```

---

## API Changes

### Updated endpoints

**`GET /api/v1/recipes`** — new sort option
```
?sort=hot        — hot ranking (default for homepage)
?sort=newest     — by extracted_at DESC (current default)
?sort=top        — by total vote_count DESC (all-time best)
?sort=time       — by cook time ASC
```

**`GET /api/v1/health`** — add featured recipe
```json
{
  "featured_recipe_id": "abc-123",
  "featured_recipe_title": "Creamy Tuscan Chicken"
}
```

### New endpoints

**`POST /api/v1/recipes/:id/heart`** — heart a recipe
- Requires auth
- Inserts into `recipe_votes` with weight 1.0
- Updates `vote_count` and `hot_score` on recipes table
- Returns `{ hearted: true, vote_count: 42 }`

**`DELETE /api/v1/recipes/:id/heart`** — un-heart
- Requires auth
- Removes from `recipe_votes`
- Decrements `vote_count`, recalculates `hot_score`
- Returns `{ hearted: false, vote_count: 41 }`

**`GET /api/v1/recipes/:id/heart`** — check if user hearted
- Requires auth
- Returns `{ hearted: true/false }`

### Implicit voting (no new endpoints needed)

These existing endpoints should trigger vote signals:

- **`POST /api/v1/bookmarks`** — when a user bookmarks a recipe, also insert a vote with weight 1.0
- **`POST /api/v1/shopping-lists/:id/recipes`** — when adding a recipe to a shopping list, insert a vote with weight 1.5
- **Recipe detail view** — authenticated view already tracked in `recipe_views`, use as a 0.1 weight signal

---

## Frontend Changes

### Homepage

- **Featured recipe** = recipe with highest `hot_score`
- **Trending shelf** = top 6 by `hot_score`
- Default recipe list sorted by `hot_score` instead of `extracted_at`

### Recipe card

- Show heart count on each card
- Heart icon (filled/unfilled) — click to toggle

### Recipe detail page

- Heart button with count
- "X people saved this recipe" social proof

### Search results

- New "Sort by: Popular" option uses `hot_score`
- Default search sort changes from relevance-only to relevance × hot_score blend

---

## Score Recomputation

### On every vote (real-time update)

When a user hearts/un-hearts/adds to list:

```typescript
// In the vote endpoint
const EPOCH = 1704067200; // 2024-01-01T00:00:00Z

async function updateHotScore(db: D1Database, recipeId: string) {
  const stats = await db.prepare(`
    SELECT COUNT(*) as count, MIN(created_at) as first_voted
    FROM recipe_votes WHERE recipe_id = ?
  `).bind(recipeId).first();

  const votes = stats.count ?? 0;
  const firstVoted = stats.first_voted
    ? new Date(stats.first_voted).getTime() / 1000
    : Date.now() / 1000;

  const score = Math.log10(Math.max(votes, 1)) +
    (firstVoted - EPOCH) / 45000;

  await db.prepare(`
    UPDATE recipes SET vote_count = ?, hot_score = ?, first_voted_at = ?
    WHERE id = ?
  `).bind(votes, score, stats.first_voted, recipeId).run();
}
```

### Periodic refresh (catches drift)

A scheduled worker runs every 15 minutes to recompute all active scores:

```sql
UPDATE recipes SET hot_score =
  LOG10(MAX(vote_count, 1)) +
  (CAST(strftime('%s', COALESCE(first_voted_at, extracted_at)) AS REAL) - 1704067200) / 45000.0
WHERE vote_count > 0;
```

---

## Cross-Database Sync

Votes live in the **users DB** (`recipe_votes`), but `hot_score` and `vote_count` need to be on the **recipes DB** for fast queries.

**Sync strategy:** The vote endpoint writes to both databases:
1. Insert/delete in `recipe_votes` (users DB)
2. Update `vote_count` and `hot_score` on `recipes` (recipes DB)

If the recipes DB write fails, the vote is still recorded — the periodic refresh will catch it.

---

## Anti-Gaming

- **One vote per user per recipe per action** — primary key constraint prevents duplicates
- **Authenticated only** — anonymous users can't vote
- **Rate limiting** — max 100 hearts per user per day (KV counter)
- **No self-voting** — if we add user-submitted recipes later, creators can't vote on their own
- **Decay is built-in** — bot-farmed votes from last week naturally lose ranking to organic votes today

---

## Migration Path

### Phase 1: Schema + heart endpoint (1 day)
- Add columns to recipes table
- Create recipe_votes table
- Build heart/un-heart endpoints
- Wire bookmark creates to also generate votes

### Phase 2: Frontend (1 day)
- Heart button on recipe cards and detail page
- Sort by hot on homepage
- "Popular" sort option in search

### Phase 3: Featured + trending (half day)
- Homepage featured = top hot_score recipe
- Trending shelf = top 6 by hot_score
- Health endpoint includes featured recipe

### Phase 4: Periodic refresh worker (half day)
- Cron worker to recompute stale scores
- Handles edge cases (deleted votes, cross-DB drift)

---

## Open Questions

1. **Should the decay constant be tunable?** 45,000 seconds (~12.5 hours) works for Reddit-scale. With fewer users, a longer decay (e.g. 90,000 = ~25 hours) might be better so content doesn't rotate too fast.

2. **Should we weight votes by user reputation?** e.g. a user who has been active for 6 months and has 50 bookmarks gets a 1.2x multiplier on their votes. Adds complexity but improves quality.

3. **Should recipe age factor in?** Currently, a newly crawled recipe with 1 vote can briefly outrank an old recipe with 100 votes. We could add a minimum vote threshold for hot ranking (e.g. need ≥3 votes to appear in "trending").

4. **How to handle the cold start?** With few users, most recipes will have 0 votes. The homepage should fall back to `extracted_at` ordering until we have enough engagement data. Threshold: switch to hot ranking when ≥100 total votes exist.
