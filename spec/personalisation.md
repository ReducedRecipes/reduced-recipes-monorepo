# ReducedRecipes — Personalisation, Social & Commerce Specification

**Version:** 1.0
**Date:** 2026-04-16
**Status:** Draft
**Depends on:** [Initial Spec](./inital-spec.md) · [Mobile App Spec](./mobile-app.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phased Milestones](#2-phased-milestones)
3. [Phase 1 — Auth, User Profiles, Dietary Preferences, Bookmarks](#3-phase-1--auth-user-profiles-dietary-preferences-bookmarks)
4. [Phase 2 — Ratings & Reviews](#4-phase-2--ratings--reviews)
5. [Phase 3 — Shopping Lists](#5-phase-3--shopping-lists)
6. [Phase 4 — AI-Assisted Recommendations & Meal Planning](#6-phase-4--ai-assisted-recommendations--meal-planning)
7. [Database Schema](#7-database-schema)
8. [API Endpoint Design](#8-api-endpoint-design)
9. [Technical Architecture](#9-technical-architecture)
10. [Security Considerations](#10-security-considerations)
11. [GDPR Compliance](#11-gdpr-compliance)
12. [Performance Considerations](#12-performance-considerations)
13. [Open Questions & Risks](#13-open-questions--risks)

---

## 1. Executive Summary

ReducedRecipes currently serves ~60,000 recipes crawled from 400+ domains via a fully anonymous, read-only experience. This specification adds four phases of personalisation and social features that transform the product from a recipe viewer into a cooking companion:

- **Phase 1** introduces CF-native authentication (Google SSO), user profiles, dietary preference filtering, and bookmark collections — the foundational identity layer everything else builds on.
- **Phase 2** adds public ratings and text reviews with spam prevention, creating community-driven quality signals.
- **Phase 3** delivers structured shopping lists with ingredient parsing, smart rollup/deduplication, shareable links, and real-time collaboration via Durable Objects.
- **Phase 4** layers on AI-powered recipe recommendations and meal planning, leveraging the user behaviour data accumulated in Phases 1-3.

All user data lives in a **separate D1 database** (`reduced-recipes-users`) from the recipes database (`reduced-recipes-prod`). The system is GDPR-compliant with full data export and account deletion.

### Design Principles

1. **Browse freely, sign in to interact.** No gate on reading; CTAs appear when unauthenticated users attempt to bookmark, rate, or save.
2. **Dietary restrictions are hard filters.** If a user marks "Gluten-Free", non-matching recipes vanish from every view — search, browse, recommendations — without degrading query performance.
3. **Offline-first on mobile.** Bookmarked recipes are available offline. Shopping lists sync when connectivity returns. Last-write-wins conflict resolution keeps the model simple.
4. **CF-native throughout.** Workers, D1, KV, Durable Objects, Queues, R2. No third-party auth services, no external databases.

---

## 2. Phased Milestones

### Phase 1 — Identity & Collections (Weeks 1-6)

| Deliverable | Description |
|---|---|
| Auth Worker | CF Workers-based auth with Google SSO, session management via KV |
| User profiles | Profile page showing reviews, collections, following |
| Onboarding flow | Post-signup dietary preference selection |
| Dietary filtering | Hard-filter exclusion of non-matching recipes across all views |
| Bookmarks & collections | Folder-based organisation with default "Saved" collection |
| Offline bookmarks (mobile) | MMKV-backed offline storage with last-write-wins sync |
| Privacy controls | Public/private profile toggle |
| Follow system | Follow users to see their public collections |

### Phase 2 — Ratings & Reviews (Weeks 7-10)

| Deliverable | Description |
|---|---|
| Star ratings | 1-5 star public ratings with aggregate scores |
| Text reviews | Reviews alongside ratings, displayed with user name + avatar |
| Top Rated section | Global leaderboard of highest-rated recipes |
| Spam prevention | Blacklisted words, English-only, interaction gating, rate limiting |
| Report/flag system | Users can flag reviews for moderation |

### Phase 3 — Shopping Lists (Weeks 11-16)

| Deliverable | Description |
|---|---|
| Shopping list CRUD | Multiple lists with a default list |
| Ingredient parsing | Queue-based parsing of schema.org ingredient strings into structured data |
| Smart rollup | Cross-recipe ingredient deduplication and quantity aggregation |
| Manual items | Users can add free-text items to any list |
| Check-off | Mark items as purchased while shopping |
| Shareable links | Anyone with a link can view/edit a list |
| Real-time collaboration | Durable Objects for live multi-user editing |

### Phase 4 — AI Features (Weeks 17-22)

| Deliverable | Description |
|---|---|
| Recommendation engine | Personalised recipe suggestions based on bookmarks, ratings, history |
| Meal planner | "Plan my week" generates 7-day meal plan respecting dietary prefs |
| Shopping list generation | Meal plan auto-generates a consolidated shopping list |
| Repetition avoidance | Considers recently cooked recipes to avoid monotony |

---

## 3. Phase 1 — Auth, User Profiles, Dietary Preferences, Bookmarks

### 3.1 Authentication

#### Flow: Google SSO

```
[Client] ─── GET /api/v1/auth/google/url ──────────► [Auth Worker]
         ◄── { url: "https://accounts.google.com/o/oauth2/v2/auth?..." } ───

[Client] ─── redirect to Google ───────────────────► [Google]
         ◄── redirect to /auth/callback?code=... ──────────────

[Client] ─── GET /api/v1/auth/google/callback?code=XYZ ─► [Auth Worker]
  Auth Worker:
    1. Exchange code for tokens (Google tokeninfo endpoint)
    2. Extract: google_id, email, name, picture
    3. UPSERT user in D1 (users table)
    4. Generate session_token (crypto.randomUUID + timestamp)
    5. Store session in KV: SESSION_KV.put(`session:{token}`, JSON.stringify(session), { expirationTtl: 2592000 })
    6. Return: { session_token, user, is_new_user }
         ◄── { session_token, user: { id, name, picture, ... }, is_new_user: true }

[Client stores session_token in SecureStore (mobile) / httpOnly cookie (web)]
```

#### Session Management

- **Storage:** KV namespace `SESSION_KV`, key `session:{token}`, TTL 30 days.
- **Token format:** `{uuid_v4}.{timestamp_hex}` — the timestamp allows the server to reject tokens older than a maximum age without a KV lookup.
- **Refresh:** On each authenticated request, if the session is older than 7 days, issue a new token, write it to KV, delete the old one, and return the new token in a `X-New-Session-Token` header.
- **Logout:** Delete the KV key. Client discards the token.
- **Middleware:** A Hono middleware `requireAuth` extracts the `Authorization: Bearer {token}` header, looks up the session in KV, and attaches `c.set('user', session.user)` to the context. Returns 401 if missing/expired.

#### Auth Middleware (pseudocode)

```typescript
const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, 401);

  const raw = await c.env.SESSION_KV.get(`session:${token}`, 'text');
  if (!raw) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }, 401);

  const session = JSON.parse(raw);
  c.set('userId', session.user_id);
  c.set('user', session.user);

  // Refresh if older than 7 days
  const ageMs = Date.now() - session.created_at;
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    const newToken = `${crypto.randomUUID()}.${Date.now().toString(16)}`;
    await c.env.SESSION_KV.put(`session:${newToken}`, raw, { expirationTtl: 2592000 });
    await c.env.SESSION_KV.delete(`session:${token}`);
    c.header('X-New-Session-Token', newToken);
  }

  await next();
};

// Optional variant — does not block, just attaches user if present
const optionalAuth: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (token) {
    const raw = await c.env.SESSION_KV.get(`session:${token}`, 'text');
    if (raw) {
      const session = JSON.parse(raw);
      c.set('userId', session.user_id);
      c.set('user', session.user);
    }
  }
  await next();
};
```

### 3.2 User Profiles

#### Data Model

Users have a minimal profile auto-populated from Google:

- `id` — UUIDv4 generated server-side
- `google_id` — Google's unique subject ID
- `email` — from Google
- `name` — from Google (display name)
- `picture_url` — from Google (profile picture URL)
- `profile_public` — boolean, default `true`
- `created_at`, `updated_at`

#### Profile Page

The public profile page (`/user/{id}`) shows:

- Name + profile picture
- Join date
- Public collections (if profile is public)
- Reviews written (if profile is public)
- Follower/following counts

If the profile is private, only the user's name and picture are visible.

#### Follow System

Users can follow other users to discover their public collections. Following is one-directional (not mutual). The follow action appears on public profiles.

### 3.3 Dietary Preferences

#### Onboarding

After first sign-in (`is_new_user: true`), the client shows a full-screen onboarding modal:

1. "Welcome to ReducedRecipes! Let's personalise your experience."
2. Grid of dietary restriction chips — multi-select.
3. "These are hard filters — recipes that don't match will be hidden from all views."
4. Skip option: "No restrictions" button.

#### Dietary Restriction Categories

| ID | Label | Tag Match Logic |
|---|---|---|
| `vegetarian` | Vegetarian | Exclude recipes tagged `meat`, `poultry`, `fish`, `seafood` unless also tagged `vegetarian` |
| `vegan` | Vegan | Exclude recipes not tagged `vegan` (strict) |
| `gluten-free` | Gluten-Free | Exclude recipes not tagged `gluten-free` |
| `dairy-free` | Dairy-Free | Exclude recipes not tagged `dairy-free` |
| `nut-free` | Nut-Free | Exclude recipes not tagged `nut-free` |
| `keto` | Keto | Exclude recipes not tagged `keto` |
| `halal` | Halal | Exclude recipes tagged `pork`, `alcohol` unless also tagged `halal` |
| `kosher` | Kosher | Exclude recipes not tagged `kosher` |
| `low-carb` | Low-Carb | Exclude recipes not tagged `low-carb` |
| `paleo` | Paleo | Exclude recipes not tagged `paleo` |
| `pescatarian` | Pescatarian | Exclude recipes tagged `meat`, `poultry` unless also tagged `pescatarian` or `fish` |
| `egg-free` | Egg-Free | Exclude recipes not tagged `egg-free` |
| `soy-free` | Soy-Free | Exclude recipes not tagged `soy-free` |
| `shellfish-free` | Shellfish-Free | Exclude recipes not tagged `shellfish-free` |
| `low-sodium` | Low-Sodium | Exclude recipes not tagged `low-sodium` |
| `sugar-free` | Sugar-Free | Exclude recipes not tagged `sugar-free` |

#### Filtering Implementation — Tag Exclusion Table

To avoid per-query performance overhead, filtering uses a **pre-computed exclusion approach**:

1. **Recipes DB — `recipe_dietary_flags` table:** A background job (Queue worker) analyses each recipe's tags and ingredients and sets boolean flags: `is_vegetarian`, `is_vegan`, `is_gluten_free`, etc. This runs during the projection step.

2. **Recipes DB schema addition:**

```sql
CREATE TABLE IF NOT EXISTS recipe_dietary_flags (
  recipe_id       TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  is_vegetarian   INTEGER NOT NULL DEFAULT 0,
  is_vegan        INTEGER NOT NULL DEFAULT 0,
  is_gluten_free  INTEGER NOT NULL DEFAULT 0,
  is_dairy_free   INTEGER NOT NULL DEFAULT 0,
  is_nut_free     INTEGER NOT NULL DEFAULT 0,
  is_keto         INTEGER NOT NULL DEFAULT 0,
  is_halal        INTEGER NOT NULL DEFAULT 0,
  is_kosher       INTEGER NOT NULL DEFAULT 0,
  is_low_carb     INTEGER NOT NULL DEFAULT 0,
  is_paleo        INTEGER NOT NULL DEFAULT 0,
  is_pescatarian  INTEGER NOT NULL DEFAULT 0,
  is_egg_free     INTEGER NOT NULL DEFAULT 0,
  is_soy_free     INTEGER NOT NULL DEFAULT 0,
  is_shellfish_free INTEGER NOT NULL DEFAULT 0,
  is_low_sodium   INTEGER NOT NULL DEFAULT 0,
  is_sugar_free   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_dietary_vegetarian  ON recipe_dietary_flags(is_vegetarian)  WHERE is_vegetarian = 1;
CREATE INDEX IF NOT EXISTS idx_dietary_vegan       ON recipe_dietary_flags(is_vegan)       WHERE is_vegan = 1;
CREATE INDEX IF NOT EXISTS idx_dietary_gluten_free ON recipe_dietary_flags(is_gluten_free) WHERE is_gluten_free = 1;
-- ... partial indexes for each flag
```

3. **Query modification:** When a user has dietary preferences, the API injects a `JOIN` and `WHERE` conditions:

```sql
-- User has: vegetarian + gluten_free
SELECT r.*
FROM recipes r
JOIN recipe_dietary_flags rdf ON rdf.recipe_id = r.id
WHERE rdf.is_vegetarian = 1
  AND rdf.is_gluten_free = 1
  AND r.extracted_at < ?  -- cursor
ORDER BY r.extracted_at DESC
LIMIT 25;
```

This is efficient because:
- Partial indexes make flag lookups fast (only index rows where flag = 1).
- The JOIN is a single PK lookup per row.
- No subqueries, no `NOT IN`, no `NOT EXISTS`.
- D1's SQLite engine handles this well even at 60k+ rows.

4. **KV cache layer:** For common preference combinations (e.g., "vegetarian"), cache the first few pages of results in KV with a 15-minute TTL. Cache key: `dietary-feed:{sorted_prefs_hash}:{cursor}`.

5. **User preferences are sent with every API request** via a lightweight mechanism: the `X-Dietary-Prefs` header contains a comma-separated list (e.g., `vegetarian,gluten-free`). The API middleware reads this and injects the filter conditions. This avoids a D1 lookup for the user's preferences on every request — the client is the source of truth, validated at write time.

#### Settings — Change Preferences

Users can modify their dietary preferences at any time via Settings > Dietary Preferences. The client updates the local state immediately and PATCHes the server. The next API request includes the updated `X-Dietary-Prefs` header.

### 3.4 Bookmarks & Collections

#### Data Model

```
User
 └── Collection (folder)
      └── Bookmark (recipe reference)
```

Every user has a default "Saved" collection that cannot be deleted or renamed. Users can create additional named collections (e.g., "Weeknight Dinners", "Date Night", "Holiday Baking").

#### Quick Bookmark

Tapping the bookmark icon on a recipe card adds it to the default "Saved" collection. Long-press (mobile) or dropdown (web) lets the user choose a specific collection.

#### Offline Support (Mobile)

When a recipe is bookmarked:

1. The full `RecipeDocument` JSON is fetched from KV (via the `/api/v1/recipes/:id` endpoint).
2. Stored locally in MMKV (key: `bookmark:{recipe_id}`, value: serialised JSON).
3. A local SQLite table `offline_bookmarks` tracks the bookmark metadata for listing.

**Sync protocol (last-write-wins):**

- Each bookmark/unbookmark action has a `client_timestamp` (ISO 8601, millisecond precision).
- When the device comes online, it sends a batch of pending actions: `POST /api/v1/sync/bookmarks` with `[{ recipe_id, collection_id, action: 'add'|'remove', client_timestamp }]`.
- The server compares `client_timestamp` against the stored `updated_at`. If the client timestamp is newer, the client wins. Otherwise the server state persists.
- The server responds with the canonical state of all bookmarks modified in the batch.
- The client reconciles and updates local storage.

#### Collection Visibility

Collections inherit the user's profile visibility setting. If the profile is public, collections are visible to followers on the profile page. Users can override visibility per-collection (public/private).

---

## 4. Phase 2 — Ratings & Reviews

### 4.1 Star Ratings

- **Scale:** 1-5 stars, integer only.
- **Constraint:** One rating per user per recipe. Re-rating overwrites the previous value.
- **Aggregation:** Stored as `rating_sum` and `rating_count` on the recipe. Average computed at read time: `rating_sum / rating_count`. This avoids recomputing across all rows.
- **Display:** Shown on recipe cards (summary) and detail pages. "Top Rated" section on the home page shows recipes with `rating_count >= 5` ordered by `rating_sum / rating_count DESC`.

### 4.2 Text Reviews

- Users can write an optional text review alongside their star rating.
- **Length:** 10-2000 characters.
- **Display:** Reviews show the user's name, profile picture, star rating, review text, and timestamp.
- **Ordering:** Most recent first, with an option to sort by rating (high-to-low, low-to-high).

### 4.3 Spam Prevention

| Measure | Implementation |
|---|---|
| **Interaction gate** | User must have bookmarked the recipe OR spent >30 seconds on the recipe detail page (tracked client-side, sent as a claim in the request) before they can rate/review. |
| **Blacklisted words** | Server-side list of ~500 blacklisted words/phrases. Review text is checked before insertion. Rejection returns a generic "Review could not be posted" message (does not reveal which word triggered it). |
| **English-only** | Basic language detection: reject reviews where >30% of characters are non-Latin or the text fails a simple English word frequency check. Not perfect, but catches obvious non-English spam. |
| **Rate limiting** | Max 10 reviews per user per 24-hour window. Enforced via a KV counter: `review-ratelimit:{user_id}:{date}`. |
| **Minimum account age** | Account must be >24 hours old to submit a review. |

### 4.4 Report / Flag System

- Any authenticated user can flag a review once (idempotent).
- Flags are stored in the `review_flags` table.
- Reviews with >= 3 flags are auto-hidden and queued for manual moderation.
- A simple admin endpoint lists flagged reviews for moderation: `GET /api/v1/admin/reviews/flagged`.
- Admin actions: `approve` (clears flags), `remove` (soft-deletes the review).

### 4.5 Aggregate Rating Storage

To avoid computing aggregates on every recipe card render, rating aggregates are denormalised:

- **Users DB:** `recipe_rating_aggregates` table holds `recipe_id`, `rating_sum`, `rating_count`.
- **Recipes DB:** The projection worker reads these aggregates and writes `avg_rating` and `rating_count` into the recipes D1 row. This is updated asynchronously via a Queue job whenever a rating is submitted.
- **KV cache:** Recipe detail responses in KV include the latest aggregate. Updated via a Queue consumer that patches the KV document.

---

## 5. Phase 3 — Shopping Lists

### 5.1 Data Model

```
User
 └── ShoppingList
      ├── ShoppingListItem (parsed ingredient or manual)
      └── ShoppingListRecipe (link to source recipe)
```

Every user has a default shopping list ("Shopping List") that cannot be deleted. Users can create additional lists. Each collection can also have an associated shopping list (1:1 relationship via `collection_id` on the shopping list).

### 5.2 Ingredient Parsing

Recipe ingredients from schema.org are stored as free-text strings (e.g., `"2 cups all-purpose flour"`). A Queue worker parses these into structured data:

**Parsing pipeline:**

```
[User adds recipe to shopping list]
       │
       ▼
[API writes ShoppingListRecipe row + enqueues INGREDIENT_PARSE_QUEUE]
       │
       ▼
[Worker: Ingredient Parser]
  1. Fetch recipe ingredients from KV
  2. For each ingredient string, extract:
     - quantity (number): 2
     - unit (normalised): "cup"
     - item (canonical name): "all-purpose flour"
     - original_text: "2 cups all-purpose flour"
  3. Write structured ShoppingListItem rows to Users DB
```

**Parsing strategy:**

- Regex-based parser handles common patterns: `{quantity} {unit} {item}`, `{quantity} {item}`, `{item}`.
- Unit normalisation table: `tbsp` -> `tablespoon`, `oz` -> `ounce`, `c` -> `cup`, etc.
- Fractions: `1/2` -> `0.5`, `1 1/2` -> `1.5`.
- Ranges: `2-3 cloves garlic` -> quantity `2.5`, item `garlic`, unit `clove`.
- Parenthetical notes stripped: `1 cup butter (melted)` -> quantity `1`, unit `cup`, item `butter`.
- If parsing fails, the item is stored as a manual entry with `original_text` intact and `parse_failed = true`.

### 5.3 Smart Rollup (Deduplication)

When displaying a shopping list, items from multiple recipes are combined:

```
Recipe A: "2 onions, diced"     → { qty: 2, unit: null, item: "onion" }
Recipe B: "1 large onion"       → { qty: 1, unit: null, item: "onion" }
─────────────────────────────────────────────────────────────
Display:  "3 onions"            → Combined
          └── from: Recipe A (2), Recipe B (1)
```

**Rollup rules:**

1. Items are grouped by canonical `item` name (lowercased, singularised, trimmed).
2. If units match (or both are null), quantities are summed.
3. If units differ but are convertible (e.g., `tablespoon` + `teaspoon`), convert to the larger unit.
4. If units are incompatible (e.g., `cup` flour + `1 bunch` parsley), they remain separate entries.
5. Rollup is computed at read time (not stored), so it stays fresh as items are added/removed.

### 5.4 Manual Items

Users can add free-text items to any shopping list. These are stored with `source = 'manual'` and bypass ingredient parsing. They participate in rollup by canonical item name if possible.

### 5.5 Check-Off

Each `ShoppingListItem` has a `checked` boolean. Tapping an item toggles it. Checked items move to the bottom of the list, grouped under a "Purchased" section. Users can "uncheck all" to reset the list for a new trip.

### 5.6 Shareable Links

- `POST /api/v1/shopping-lists/:id/share` generates a share token (crypto.randomUUID).
- The token is stored on the shopping list row: `share_token`.
- Anyone with the URL `/shared/list/{share_token}` can view and edit the list.
- The owner can revoke sharing: `DELETE /api/v1/shopping-lists/:id/share` nulls the token.
- No authentication required for shared list access — the token is the credential.

### 5.7 Real-Time Collaboration (Durable Objects)

When two or more users are viewing the same shopping list (either the owner and a shared-link user, or multiple shared-link users), changes propagate in real time via WebSocket.

**Architecture:**

```
[Client A] ──── WebSocket ──── [Durable Object: ShoppingList:{list_id}] ──── WebSocket ──── [Client B]
                                          │
                                          │ (persist to D1 on each mutation)
                                          ▼
                                    [Users D1 DB]
```

**Durable Object: `ShoppingListDO`**

- One instance per shopping list (keyed by `list_id`).
- Maintains a list of connected WebSocket sessions.
- On receiving a mutation message (add item, check item, remove item, update quantity):
  1. Validate the mutation.
  2. Apply to D1 (the source of truth).
  3. Broadcast the mutation to all other connected sessions.
- On WebSocket connect, sends the full current state of the list.
- Idle timeout: If no connections for 60 seconds, the DO hibernates (Cloudflare handles this automatically with WebSocket Hibernation API).

**Message protocol (JSON over WebSocket):**

```typescript
// Client → Server
type ClientMessage =
  | { type: 'add_item'; item: { text: string } }
  | { type: 'check_item'; item_id: string; checked: boolean }
  | { type: 'remove_item'; item_id: string }
  | { type: 'update_quantity'; item_id: string; quantity: number }
  | { type: 'uncheck_all' };

// Server → Client
type ServerMessage =
  | { type: 'state'; items: ShoppingListItem[] }
  | { type: 'item_added'; item: ShoppingListItem }
  | { type: 'item_checked'; item_id: string; checked: boolean }
  | { type: 'item_removed'; item_id: string }
  | { type: 'item_updated'; item: ShoppingListItem }
  | { type: 'all_unchecked' }
  | { type: 'error'; message: string };
```

---

## 6. Phase 4 — AI-Assisted Recommendations & Meal Planning

> Phase 4 is a separate feature set and will not be tightly integrated into shopping lists or other Phase 1-3 features initially. It is its own screen/flow.

### 6.1 Recommendation Engine

**Inputs:**
- User's bookmarked recipes (tags, cuisines, domains)
- User's ratings (what they rated highly)
- Recently viewed recipes (tracked via a lightweight `recipe_views` table)
- Dietary preferences (hard filters still apply)

**Algorithm (initial — non-ML):**
1. Build a user taste profile: weighted vector of tags, cuisines, and domains based on bookmarks (weight: 1), high ratings (weight: 2), and views (weight: 0.3).
2. Score each candidate recipe by cosine similarity to the user's taste vector.
3. Exclude recipes the user has already bookmarked or viewed in the last 7 days.
4. Apply dietary filters.
5. Return top-N candidates.

**Implementation:** Runs as a scheduled Worker (daily or on-demand). Pre-computes recommendations and stores them in KV: `recommendations:{user_id}` with a 24-hour TTL. The API serves from KV.

**Future (ML-based):** If usage warrants, replace the heuristic scorer with a CF Workers AI model or an external embedding-based approach. The API contract remains the same.

### 6.2 Meal Planner

**"Plan My Week" flow:**

1. User taps "Plan My Week" in the Meal Planning screen.
2. Client sends `POST /api/v1/meal-plans/generate` with optional constraints:
   - `days: 7` (default)
   - `meals_per_day: 2` (lunch + dinner, configurable)
   - `exclude_recipe_ids: [...]` (recently cooked)
   - `prefer_quick: boolean` (bias toward <30 min total_time)
3. The API generates a plan:
   - Select recipes from the recommendation pool.
   - Ensure variety: no two meals with the same primary cuisine in a row, no repeated protein sources on the same day.
   - Respect dietary preferences.
   - Avoid recipes cooked in the last 14 days (from `recipe_views` where `source = 'cooked'`).
4. Return a `MealPlan` object with day-by-day recipe assignments.
5. User can swap individual meals (re-roll) or accept the plan.
6. "Generate Shopping List" takes all recipes in the accepted plan, parses ingredients, and creates a new shopping list with smart rollup.

### 6.3 Data Requirements

Phase 4 depends on sufficient user data from Phases 1-3:
- Minimum ~50 bookmarks or ratings per user for meaningful recommendations.
- The `recipe_views` table needs to be populated (Phase 1 should start tracking views).

---

## 7. Database Schema

### 7.1 Users Database (`reduced-recipes-users`)

This is a **separate D1 instance** from the recipes database.

```sql
-- =============================================
-- Migration 0001: Core user tables (Phase 1)
-- =============================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  google_id       TEXT NOT NULL UNIQUE,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  picture_url     TEXT,
  profile_public  INTEGER NOT NULL DEFAULT 1,  -- 1 = public, 0 = private
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Dietary preferences
CREATE TABLE IF NOT EXISTS user_dietary_preferences (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  restriction     TEXT NOT NULL,  -- e.g. 'vegetarian', 'gluten-free'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, restriction)
);

-- Collections (bookmark folders)
CREATE TABLE IF NOT EXISTS collections (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,  -- 1 = the "Saved" collection
  is_public       INTEGER NOT NULL DEFAULT 1,
  position        INTEGER NOT NULL DEFAULT 0,  -- sort order
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

-- Bookmarks
CREATE TABLE IF NOT EXISTS bookmarks (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id   TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,  -- references recipes DB (cross-DB, not FK)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_collection ON bookmarks(collection_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_recipe ON bookmarks(recipe_id);

-- Follows
CREATE TABLE IF NOT EXISTS follows (
  follower_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Recipe views (for recommendations in Phase 4, start collecting in Phase 1)
CREATE TABLE IF NOT EXISTS recipe_views (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'view',  -- 'view', 'cooked'
  viewed_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recipe_views_user ON recipe_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_views_recipe ON recipe_views(recipe_id);
```

```sql
-- =============================================
-- Migration 0002: Ratings & Reviews (Phase 2)
-- =============================================

-- Ratings
CREATE TABLE IF NOT EXISTS ratings (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_recipe ON ratings(recipe_id);

-- Rating aggregates (denormalised for performance)
CREATE TABLE IF NOT EXISTS recipe_rating_aggregates (
  recipe_id       TEXT PRIMARY KEY,
  rating_sum      INTEGER NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0
);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text            TEXT NOT NULL CHECK (length(text) >= 10 AND length(text) <= 2000),
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'hidden', 'removed'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_recipe ON reviews(recipe_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

-- Review flags
CREATE TABLE IF NOT EXISTS review_flags (
  review_id       TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL DEFAULT 'inappropriate',  -- 'inappropriate', 'spam', 'offensive', 'other'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (review_id, user_id)
);
```

```sql
-- =============================================
-- Migration 0003: Shopping Lists (Phase 3)
-- =============================================

-- Shopping lists
CREATE TABLE IF NOT EXISTS shopping_lists (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id   TEXT REFERENCES collections(id) ON DELETE SET NULL,  -- optional tie to a collection
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,
  share_token     TEXT UNIQUE,  -- null = not shared, UUID = shared
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shopping_lists_user ON shopping_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_share ON shopping_lists(share_token);

-- Shopping list ↔ recipe link
CREATE TABLE IF NOT EXISTS shopping_list_recipes (
  shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id        TEXT NOT NULL,
  added_at         TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (shopping_list_id, recipe_id)
);

-- Shopping list items (parsed or manual)
CREATE TABLE IF NOT EXISTS shopping_list_items (
  id               TEXT PRIMARY KEY,  -- UUIDv4
  shopping_list_id TEXT NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  recipe_id        TEXT,  -- null for manual items
  original_text    TEXT NOT NULL,
  quantity         REAL,  -- null if parse failed
  unit             TEXT,  -- normalised unit, null if unitless
  item             TEXT,  -- canonical item name, null if parse failed
  checked          INTEGER NOT NULL DEFAULT 0,
  parse_failed     INTEGER NOT NULL DEFAULT 0,
  source           TEXT NOT NULL DEFAULT 'recipe',  -- 'recipe', 'manual'
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sli_list ON shopping_list_items(shopping_list_id);
CREATE INDEX IF NOT EXISTS idx_sli_item ON shopping_list_items(item);
```

```sql
-- =============================================
-- Migration 0004: Meal Plans (Phase 4)
-- =============================================

CREATE TABLE IF NOT EXISTS meal_plans (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  start_date      TEXT NOT NULL,  -- ISO date
  end_date        TEXT NOT NULL,
  shopping_list_id TEXT REFERENCES shopping_lists(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'draft',  -- 'draft', 'active', 'completed'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_meal_plans_user ON meal_plans(user_id, start_date DESC);

CREATE TABLE IF NOT EXISTS meal_plan_entries (
  id              TEXT PRIMARY KEY,
  meal_plan_id    TEXT NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  day_index       INTEGER NOT NULL,  -- 0 = day 1, 6 = day 7
  meal_type       TEXT NOT NULL,     -- 'breakfast', 'lunch', 'dinner', 'snack'
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mpe_plan ON meal_plan_entries(meal_plan_id);
```

### 7.2 Recipes Database Additions

These additions go into the existing `reduced-recipes-prod` D1 database:

```sql
-- =============================================
-- Migration 0003: Dietary flags (Phase 1)
-- =============================================

CREATE TABLE IF NOT EXISTS recipe_dietary_flags (
  recipe_id         TEXT PRIMARY KEY REFERENCES recipes(id) ON DELETE CASCADE,
  is_vegetarian     INTEGER NOT NULL DEFAULT 0,
  is_vegan          INTEGER NOT NULL DEFAULT 0,
  is_gluten_free    INTEGER NOT NULL DEFAULT 0,
  is_dairy_free     INTEGER NOT NULL DEFAULT 0,
  is_nut_free       INTEGER NOT NULL DEFAULT 0,
  is_keto           INTEGER NOT NULL DEFAULT 0,
  is_halal          INTEGER NOT NULL DEFAULT 0,
  is_kosher         INTEGER NOT NULL DEFAULT 0,
  is_low_carb       INTEGER NOT NULL DEFAULT 0,
  is_paleo          INTEGER NOT NULL DEFAULT 0,
  is_pescatarian    INTEGER NOT NULL DEFAULT 0,
  is_egg_free       INTEGER NOT NULL DEFAULT 0,
  is_soy_free       INTEGER NOT NULL DEFAULT 0,
  is_shellfish_free INTEGER NOT NULL DEFAULT 0,
  is_low_sodium     INTEGER NOT NULL DEFAULT 0,
  is_sugar_free     INTEGER NOT NULL DEFAULT 0
);

-- Partial indexes: only index recipes that match the flag.
-- This keeps the index small and fast for the common query pattern:
-- "give me all recipes where is_X = 1"
CREATE INDEX IF NOT EXISTS idx_df_vegetarian    ON recipe_dietary_flags(recipe_id) WHERE is_vegetarian = 1;
CREATE INDEX IF NOT EXISTS idx_df_vegan         ON recipe_dietary_flags(recipe_id) WHERE is_vegan = 1;
CREATE INDEX IF NOT EXISTS idx_df_gluten_free   ON recipe_dietary_flags(recipe_id) WHERE is_gluten_free = 1;
CREATE INDEX IF NOT EXISTS idx_df_dairy_free    ON recipe_dietary_flags(recipe_id) WHERE is_dairy_free = 1;
CREATE INDEX IF NOT EXISTS idx_df_nut_free      ON recipe_dietary_flags(recipe_id) WHERE is_nut_free = 1;
CREATE INDEX IF NOT EXISTS idx_df_keto          ON recipe_dietary_flags(recipe_id) WHERE is_keto = 1;
CREATE INDEX IF NOT EXISTS idx_df_halal         ON recipe_dietary_flags(recipe_id) WHERE is_halal = 1;
CREATE INDEX IF NOT EXISTS idx_df_kosher        ON recipe_dietary_flags(recipe_id) WHERE is_kosher = 1;
CREATE INDEX IF NOT EXISTS idx_df_low_carb      ON recipe_dietary_flags(recipe_id) WHERE is_low_carb = 1;
CREATE INDEX IF NOT EXISTS idx_df_paleo         ON recipe_dietary_flags(recipe_id) WHERE is_paleo = 1;
CREATE INDEX IF NOT EXISTS idx_df_pescatarian   ON recipe_dietary_flags(recipe_id) WHERE is_pescatarian = 1;
CREATE INDEX IF NOT EXISTS idx_df_egg_free      ON recipe_dietary_flags(recipe_id) WHERE is_egg_free = 1;
CREATE INDEX IF NOT EXISTS idx_df_soy_free      ON recipe_dietary_flags(recipe_id) WHERE is_soy_free = 1;
CREATE INDEX IF NOT EXISTS idx_df_shellfish_free ON recipe_dietary_flags(recipe_id) WHERE is_shellfish_free = 1;
CREATE INDEX IF NOT EXISTS idx_df_low_sodium    ON recipe_dietary_flags(recipe_id) WHERE is_low_sodium = 1;
CREATE INDEX IF NOT EXISTS idx_df_sugar_free    ON recipe_dietary_flags(recipe_id) WHERE is_sugar_free = 1;

-- Rating aggregates projected into recipes DB for display on recipe cards
ALTER TABLE recipes ADD COLUMN avg_rating REAL;
ALTER TABLE recipes ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;
```

---

## 8. API Endpoint Design

All endpoints are served by the existing `rr-api` Worker at `reducedrecipes.com/api/v1/*`. New endpoints are added to the Hono app.

### 8.1 Phase 1 Endpoints

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/google/url` | No | Returns Google OAuth2 consent URL |
| `GET` | `/auth/google/callback` | No | Exchanges auth code for session |
| `POST` | `/auth/logout` | Yes | Destroys session |
| `GET` | `/auth/me` | Yes | Returns current user profile |

**`GET /auth/google/url`**

Response:
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=openid+email+profile&response_type=code&state=..." }
```

**`GET /auth/google/callback?code=...&state=...`**

Response:
```json
{
  "session_token": "a1b2c3d4-...",
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "picture_url": "https://lh3.googleusercontent.com/...",
    "profile_public": true,
    "created_at": "2026-04-16T10:00:00Z"
  },
  "is_new_user": true
}
```

**`GET /auth/me`**

Response: Same `user` object as above.

#### User Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/:id` | Optional | Get user's public profile |
| `PATCH` | `/users/me` | Yes | Update profile settings |
| `GET` | `/users/:id/collections` | Optional | Get user's public collections |
| `GET` | `/users/:id/reviews` | Optional | Get user's reviews |
| `GET` | `/users/:id/followers` | Optional | Get user's followers |
| `GET` | `/users/:id/following` | Optional | Get user's following list |
| `POST` | `/users/:id/follow` | Yes | Follow a user |
| `DELETE` | `/users/:id/follow` | Yes | Unfollow a user |

**`PATCH /users/me`**

Request:
```json
{ "name": "Jane D.", "profile_public": false }
```

#### Dietary Preferences

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/me/dietary-preferences` | Yes | Get current preferences |
| `PUT` | `/users/me/dietary-preferences` | Yes | Replace all preferences |

**`PUT /users/me/dietary-preferences`**

Request:
```json
{ "restrictions": ["vegetarian", "gluten-free"] }
```

Response:
```json
{ "restrictions": ["vegetarian", "gluten-free"], "updated_at": "2026-04-16T10:30:00Z" }
```

#### Bookmarks & Collections

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/collections` | Yes | List user's collections |
| `POST` | `/collections` | Yes | Create a collection |
| `PATCH` | `/collections/:id` | Yes | Update collection name/visibility/position |
| `DELETE` | `/collections/:id` | Yes | Delete collection (moves bookmarks to "Saved") |
| `GET` | `/collections/:id/bookmarks` | Yes | List bookmarks in a collection |
| `POST` | `/bookmarks` | Yes | Add a bookmark |
| `DELETE` | `/bookmarks/:id` | Yes | Remove a bookmark |
| `POST` | `/bookmarks/move` | Yes | Move a bookmark to a different collection |

**`POST /bookmarks`**

Request:
```json
{ "recipe_id": "abc123", "collection_id": "uuid-or-null" }
```

If `collection_id` is null, the bookmark goes to the default "Saved" collection.

#### Bookmark Sync (Mobile)

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/sync/bookmarks` | Yes | Batch sync offline bookmark changes |

**`POST /sync/bookmarks`**

Request:
```json
{
  "actions": [
    { "recipe_id": "abc", "collection_id": "uuid", "action": "add", "client_timestamp": "2026-04-16T10:00:00.000Z" },
    { "recipe_id": "def", "collection_id": null, "action": "remove", "client_timestamp": "2026-04-16T10:01:00.000Z" }
  ]
}
```

Response:
```json
{
  "results": [
    { "recipe_id": "abc", "status": "applied" },
    { "recipe_id": "def", "status": "conflict", "server_state": { "exists": true, "updated_at": "2026-04-16T10:00:30.000Z" } }
  ]
}
```

#### Modified Existing Endpoints

The existing `GET /recipes`, `GET /search`, and `GET /domains/:domain/recipes` endpoints are modified:

- Accept an `X-Dietary-Prefs` header (comma-separated list of restriction IDs).
- When present, inject a `JOIN recipe_dietary_flags` with the appropriate `WHERE` conditions.
- When absent, no filtering is applied (anonymous users see everything).

### 8.2 Phase 2 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/recipes/:id/rate` | Yes | Submit or update a rating |
| `GET` | `/recipes/:id/rating` | Optional | Get aggregate rating + user's own rating |
| `POST` | `/recipes/:id/reviews` | Yes | Submit a review |
| `GET` | `/recipes/:id/reviews` | Optional | List reviews for a recipe |
| `PATCH` | `/reviews/:id` | Yes | Edit own review |
| `DELETE` | `/reviews/:id` | Yes | Delete own review |
| `POST` | `/reviews/:id/flag` | Yes | Flag a review |
| `GET` | `/recipes/top-rated` | Optional | Get top-rated recipes |
| `GET` | `/admin/reviews/flagged` | Admin | List flagged reviews for moderation |
| `POST` | `/admin/reviews/:id/moderate` | Admin | Approve or remove a review |

**`POST /recipes/:id/rate`**

Request:
```json
{ "rating": 4 }
```

Response:
```json
{
  "user_rating": 4,
  "aggregate": { "average": 4.2, "count": 47 }
}
```

**`POST /recipes/:id/reviews`**

Request:
```json
{ "rating": 4, "text": "Great recipe! The sauce was perfect..." }
```

**`GET /recipes/:id/reviews?cursor=...&limit=20`**

Response:
```json
{
  "items": [
    {
      "id": "review-uuid",
      "user": { "id": "user-uuid", "name": "Jane Doe", "picture_url": "..." },
      "rating": 4,
      "text": "Great recipe!...",
      "created_at": "2026-04-15T18:00:00Z"
    }
  ],
  "next_cursor": "2026-04-14T12:00:00Z"
}
```

**`GET /recipes/top-rated?limit=24&cursor=...`**

Returns recipes with `rating_count >= 5`, ordered by `avg_rating DESC, rating_count DESC`. Applies dietary filters if `X-Dietary-Prefs` header is present.

### 8.3 Phase 3 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/shopping-lists` | Yes | List user's shopping lists |
| `POST` | `/shopping-lists` | Yes | Create a shopping list |
| `GET` | `/shopping-lists/:id` | Yes/Share | Get list with items (rollup applied) |
| `PATCH` | `/shopping-lists/:id` | Yes | Update list name |
| `DELETE` | `/shopping-lists/:id` | Yes | Delete list |
| `POST` | `/shopping-lists/:id/recipes` | Yes/Share | Add recipe → parse ingredients |
| `DELETE` | `/shopping-lists/:id/recipes/:recipe_id` | Yes/Share | Remove recipe + its items |
| `POST` | `/shopping-lists/:id/items` | Yes/Share | Add manual item |
| `PATCH` | `/shopping-lists/:id/items/:item_id` | Yes/Share | Update item (check/uncheck, edit quantity) |
| `DELETE` | `/shopping-lists/:id/items/:item_id` | Yes/Share | Remove item |
| `POST` | `/shopping-lists/:id/uncheck-all` | Yes/Share | Reset all checked items |
| `POST` | `/shopping-lists/:id/share` | Yes | Generate share link |
| `DELETE` | `/shopping-lists/:id/share` | Yes | Revoke share link |
| `GET` | `/shared/lists/:token` | No | Access shared list (redirects to WebSocket for real-time) |
| `GET` | `/shopping-lists/:id/ws` | Yes/Share | WebSocket upgrade for real-time collaboration |

**`GET /shopping-lists/:id`**

Response (with rollup):
```json
{
  "id": "list-uuid",
  "name": "Shopping List",
  "is_default": true,
  "share_token": null,
  "recipes": [
    { "recipe_id": "abc", "title": "Pasta Carbonara" },
    { "recipe_id": "def", "title": "Caesar Salad" }
  ],
  "items": {
    "unchecked": [
      {
        "canonical_item": "onion",
        "display_text": "3 onions",
        "total_quantity": 3,
        "unit": null,
        "sources": [
          { "item_id": "item-1", "recipe_id": "abc", "quantity": 2, "original_text": "2 onions, diced" },
          { "item_id": "item-2", "recipe_id": "def", "quantity": 1, "original_text": "1 large onion" }
        ]
      },
      {
        "canonical_item": "parmesan cheese",
        "display_text": "1.5 cups parmesan cheese",
        "total_quantity": 1.5,
        "unit": "cup",
        "sources": [
          { "item_id": "item-3", "recipe_id": "abc", "quantity": 1, "original_text": "1 cup grated parmesan" },
          { "item_id": "item-4", "recipe_id": "def", "quantity": 0.5, "original_text": "1/2 cup parmesan, shaved" }
        ]
      }
    ],
    "checked": []
  },
  "updated_at": "2026-04-16T11:00:00Z"
}
```

### 8.4 Phase 4 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/recommendations` | Yes | Get personalised recipe recommendations |
| `POST` | `/meal-plans/generate` | Yes | Generate a meal plan |
| `GET` | `/meal-plans` | Yes | List user's meal plans |
| `GET` | `/meal-plans/:id` | Yes | Get meal plan detail |
| `PATCH` | `/meal-plans/:id/entries/:entry_id` | Yes | Swap a meal (re-roll) |
| `POST` | `/meal-plans/:id/accept` | Yes | Accept plan and optionally generate shopping list |
| `DELETE` | `/meal-plans/:id` | Yes | Delete meal plan |

---

## 9. Technical Architecture

### 9.1 Worker Topology (Updated)

```
                                    ┌─────────────┐
                                    │  CF Pages    │
                                    │  React SPA   │
                                    └──────┬───────┘
                                           │
                                    ┌──────▼───────┐
                                    │   rr-api     │  (Hono on CF Workers)
                                    │              │
                                    │  + Auth      │
                                    │  + User API  │
                                    │  + Bookmarks │
                                    │  + Ratings   │
                                    │  + Shopping  │
                                    │  + Meal Plan │
                                    └──┬───┬───┬───┘
                                       │   │   │
               ┌───────────────────────┘   │   └───────────────────────┐
               ▼                           ▼                           ▼
      ┌────────────────┐         ┌─────────────────┐         ┌────────────────────┐
      │  Recipes D1    │         │   Users D1      │         │  Durable Objects   │
      │  (read model)  │         │   (user data)   │         │  ShoppingListDO    │
      └────────────────┘         └─────────────────┘         └────────────────────┘
               │                           │
      ┌────────────────┐         ┌─────────────────┐
      │  RECIPES_KV    │         │   SESSION_KV    │
      │  (source of    │         │   (sessions,    │
      │   truth)       │         │    caches)      │
      └────────────────┘         └─────────────────┘
               │
      ┌────────────────┐
      │  Queues        │
      │  - crawl-jobs  │
      │  - parse-jobs  │
      │  - projection  │
      │  - ingredient  │  ← NEW: ingredient parsing
      │  - rating-sync │  ← NEW: async rating aggregate propagation
      └────────────────┘
```

### 9.2 New Cloudflare Resources

| Resource | Type | Binding | Purpose |
|---|---|---|---|
| `reduced-recipes-users` | D1 | `USERS_DB` | All user data (profiles, bookmarks, ratings, reviews, shopping lists, meal plans) |
| `rr-sessions` | KV | `SESSION_KV` | Session tokens (30-day TTL) |
| `rr-user-cache` | KV | `USER_CACHE_KV` | Cached user-specific data (recommendations, dietary feed pages) |
| `ShoppingListDO` | Durable Object | `SHOPPING_LIST_DO` | Real-time shopping list collaboration |
| `ingredient-parse-jobs` | Queue | `INGREDIENT_PARSE_QUEUE` | Async ingredient parsing |
| `rating-sync-jobs` | Queue | `RATING_SYNC_QUEUE` | Propagate rating aggregates to recipes DB + KV |

### 9.3 Env Binding Updates

```typescript
// Additions to the Env interface in @rr/shared/types.ts
export interface Env {
  // ... existing bindings ...

  // Phase 1
  USERS_DB: D1Database;
  SESSION_KV: KVNamespace;
  USER_CACHE_KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;  // for signing state params

  // Phase 3
  SHOPPING_LIST_DO: DurableObjectNamespace;
  INGREDIENT_PARSE_QUEUE: Queue;

  // Phase 2
  RATING_SYNC_QUEUE: Queue;
}
```

### 9.4 wrangler.api.toml Additions

```toml
# --- Users D1 ---
[[d1_databases]]
binding = "USERS_DB"
database_id = "TBD"
database_name = "reduced-recipes-users"
migrations_dir = "../../migrations-users"

# --- Session KV ---
[[kv_namespaces]]
binding = "SESSION_KV"
id = "TBD"

# --- User Cache KV ---
[[kv_namespaces]]
binding = "USER_CACHE_KV"
id = "TBD"

# --- Durable Objects (Phase 3) ---
[durable_objects]
bindings = [
  { name = "SHOPPING_LIST_DO", class_name = "ShoppingListDO" }
]

[[migrations]]
tag = "v1"
new_classes = ["ShoppingListDO"]

# --- Queues ---
[[queues.producers]]
binding = "INGREDIENT_PARSE_QUEUE"
queue = "ingredient-parse-jobs"

[[queues.producers]]
binding = "RATING_SYNC_QUEUE"
queue = "rating-sync-jobs"

[[queues.consumers]]
queue = "ingredient-parse-jobs"
max_batch_size = 10
max_retries = 3

[[queues.consumers]]
queue = "rating-sync-jobs"
max_batch_size = 10
max_retries = 3
```

### 9.5 Dietary Flag Computation

The dietary flag computation runs as part of the projection pipeline. When a recipe is projected into D1, the projection worker also computes dietary flags based on:

1. **Tags from the recipe** (primary signal): If a recipe is tagged `vegetarian` by the source site, mark `is_vegetarian = 1`.
2. **Ingredient analysis** (secondary signal): Scan the ingredient list for known non-compliant items (e.g., `chicken`, `beef` for vegetarian; `milk`, `butter`, `cheese` for dairy-free). Maintain a lookup table in `@rr/shared`.
3. **Conservative approach:** Only set a flag to `1` if there is positive evidence. If uncertain, leave at `0` (recipe is excluded from that dietary feed). This is safer than false positives — users with restrictions should not see questionable recipes.

### 9.6 Mobile Offline Architecture

```
┌─────────────────────────────────────────────────────┐
│                 React Native (Expo)                  │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │  TanStack     │   │  Zustand     │                │
│  │  Query        │   │  (UI state)  │                │
│  │  (server      │   └──────┬───────┘                │
│  │   cache)      │          │                        │
│  └──────┬───────┘          │                        │
│         │                   │                        │
│  ┌──────▼───────────────────▼────────┐               │
│  │         Sync Manager              │               │
│  │  - Queue offline mutations        │               │
│  │  - Replay on reconnect            │               │
│  │  - Last-write-wins resolution     │               │
│  └──────┬───────────────────┬────────┘               │
│         │                   │                        │
│  ┌──────▼───────┐   ┌──────▼───────┐                │
│  │   MMKV       │   │  expo-sqlite │                │
│  │  (bookmarks, │   │  (offline    │                │
│  │   prefs,     │   │   recipes)   │                │
│  │   queue)     │   └──────────────┘                │
│  └──────────────┘                                    │
└─────────────────────────────────────────────────────┘
```

**Offline mutation queue** (stored in MMKV):

```typescript
interface OfflineMutation {
  id: string;            // UUID for dedup
  type: 'bookmark_add' | 'bookmark_remove' | 'rate' | 'check_item' | 'uncheck_item';
  payload: Record<string, unknown>;
  timestamp: string;     // ISO 8601
  retries: number;
}
```

When the device regains connectivity (detected via `NetInfo`), the sync manager replays the queue in order, calling the appropriate batch sync endpoints.

---

## 10. Security Considerations

### 10.1 Authentication Security

| Threat | Mitigation |
|---|---|
| Session hijacking | Tokens are opaque UUIDs. Transmitted only over HTTPS. Stored in `httpOnly` cookies (web) or SecureStore (mobile). |
| CSRF | API uses `Authorization: Bearer` header (not cookies for auth decisions). CORS restricts origins. State parameter in OAuth flow prevents CSRF on the callback. |
| Token leakage | Session tokens have a 30-day TTL. Refresh rotates the token. Logout invalidates server-side. |
| OAuth state tampering | The `state` parameter is an HMAC-signed nonce (signed with `SESSION_SECRET`). Verified on callback. |
| Google token exposure | Google access/refresh tokens are never stored. Only the `id_token` claims (sub, email, name, picture) are extracted during callback and discarded. |

### 10.2 API Security

| Threat | Mitigation |
|---|---|
| Rate limiting | CF Rate Limiting rules at the edge. Additionally, per-user rate limits via KV counters for write endpoints (reviews, ratings, bookmark mutations). |
| SQL injection | All queries use parameterised bindings (D1 `.bind()`). No string interpolation in SQL. |
| XSS in reviews | Review text is stored as plain text and rendered with proper escaping on the client. No HTML allowed in reviews. |
| Overprivileged access | Users can only modify their own data. Every mutation endpoint verifies `c.get('userId') === resource.user_id`. |
| Shared list abuse | Share tokens are unguessable UUIDs (122 bits of entropy). Rate limiting on shared list writes prevents abuse. |
| Review spam | Multi-layer prevention: interaction gate, blacklist, rate limit, minimum account age. |
| Admin endpoint access | Admin endpoints require `ADMIN_TOKEN` (same pattern as existing admin endpoints). |

### 10.3 Data Isolation

- The recipes database and users database are completely separate D1 instances.
- There are no foreign key relationships between them.
- Recipe IDs in the users database are plain text references — if a recipe is deleted from the recipes DB, the bookmark/rating still exists but displays gracefully ("Recipe no longer available").
- This separation means a breach of the users DB does not expose recipe crawl infrastructure, and vice versa.

---

## 11. GDPR Compliance

### 11.1 Lawful Basis

- **Consent:** Users explicitly create an account via Google SSO. Consent is the lawful basis for processing personal data.
- **Legitimate interest:** Aggregate, anonymised rating data (after account deletion) serves a legitimate interest in product quality.

### 11.2 Data Minimisation

- Only name, email, and profile picture URL are stored from Google — no contacts, calendar, or other scopes.
- No tracking cookies. No third-party analytics pixels. No ad networks.
- `recipe_views` stores only (user_id, recipe_id, timestamp) — no IP addresses, no device fingerprints.

### 11.3 Right to Access (Data Export)

**Endpoint:** `GET /users/me/export`

- Returns a JSON file containing all user data:
  - Profile information
  - Dietary preferences
  - All bookmarks and collections
  - All ratings and reviews
  - All shopping lists and items
  - All meal plans
  - Recipe view history
  - Follow relationships
- Response is `Content-Type: application/json` with `Content-Disposition: attachment; filename="reducedrecipes-data-export.json"`.
- Rate limited to 1 export per 24 hours.

### 11.4 Right to Erasure (Account Deletion)

**Endpoint:** `DELETE /users/me`

- Requires re-authentication (user must provide their session token + confirm via a `confirm: true` body parameter).
- Deletion is processed asynchronously via a Queue job to handle cascading deletes without hitting Worker CPU limits.

**Deletion cascade:**

1. Delete all sessions from `SESSION_KV` (scan by prefix `session:{user_id}:*` — note: this requires session keys to include the user_id, which the schema should accommodate).
2. Delete all rows from: `user_dietary_preferences`, `bookmarks`, `collections`, `ratings`, `reviews`, `review_flags`, `shopping_list_items`, `shopping_list_recipes`, `shopping_lists`, `meal_plan_entries`, `meal_plans`, `recipe_views`, `follows`.
3. **Anonymise ratings:** Rating aggregates are NOT decremented (the aggregate is a property of the recipe, not the user). The individual `ratings` row is deleted but the `recipe_rating_aggregates` row remains with the contribution baked in. This is disclosed in the privacy policy.
4. Delete the `users` row.
5. Purge any KV caches: `recommendations:{user_id}`, `dietary-feed:*` entries referencing the user.

**Timeline:** Deletion completes within 72 hours (well within GDPR's "without undue delay" requirement). In practice it completes in seconds, but the 72-hour window accounts for Queue processing delays and cache expiry.

### 11.5 Session Key Design for Deletion

To support efficient session cleanup during account deletion, session KV keys should include the user_id:

- **Key format:** `session:{user_id}:{token}`
- **Lookup:** Auth middleware extracts the token from the header, but needs to know the user_id to construct the full key. Solution: encode the user_id in the token itself.
- **Revised token format:** `{user_id}.{uuid_v4}.{timestamp_hex}`
- The middleware splits on `.`, extracts user_id, constructs the KV key, and looks it up. On deletion, list all keys with prefix `session:{user_id}:` and delete them.

### 11.6 Privacy Policy Requirements

The privacy policy (served at `/privacy`) must disclose:

- What data is collected and why.
- That data is stored on Cloudflare's infrastructure (EU and US data centres).
- How to request data export and account deletion.
- That anonymised rating aggregates survive account deletion.
- That shared shopping list links become inaccessible after account deletion.
- Contact email for privacy inquiries: `privacy@reducedrecipes.com`.

---

## 12. Performance Considerations

### 12.1 Dietary Filtering — The Critical Path

Dietary filtering is the highest-risk performance concern because it touches every recipe query for authenticated users. The design must ensure zero degradation compared to the anonymous experience.

**Approach: Pre-computed flag table with partial indexes**

Why this works:
- **Partial indexes** (`WHERE is_X = 1`) mean the index only contains recipes that match that flag. For a flag like `is_vegan` that matches ~5% of recipes, the index is ~3,000 entries instead of 60,000.
- **AND conditions across flags** are efficient because SQLite can intersect small partial indexes.
- **The JOIN to `recipe_dietary_flags`** is a primary key lookup (recipe_id) — O(1) per row.

**Benchmarking targets:**
- `GET /recipes` with 2 dietary flags and cursor pagination: <50ms at p95.
- `GET /search` with dietary flags: <100ms at p95 (FTS + join).

**Fallback plan:** If D1 performance degrades with the join, pre-compute dietary-specific recipe lists in KV. Cache key: `dietary-feed:{hash(sorted_flags)}:page:{n}`. Refresh every 15 minutes via a scheduled Worker. This trades freshness for speed.

### 12.2 Rating Aggregates — Async Propagation

When a user rates a recipe:
1. The `ratings` row is written synchronously to Users D1 (fast — single row upsert).
2. The `recipe_rating_aggregates` row is updated synchronously (same DB, same transaction).
3. A `RATING_SYNC_QUEUE` message is enqueued to propagate the aggregate to the Recipes D1 (`recipes.avg_rating`, `recipes.rating_count`) and to patch the KV recipe document.

This means the rating aggregate on recipe cards is eventually consistent (~1-5 second delay), but the user's own rating is immediately visible.

### 12.3 Shopping List Ingredient Parsing — Async

Ingredient parsing is CPU-intensive (regex, NLP-lite). It runs asynchronously:
1. User adds a recipe to their shopping list → API immediately returns success.
2. A Queue message triggers the ingredient parser.
3. Parsed items are written to D1.
4. The client polls or receives a WebSocket update when parsing is complete.

Parsing a single recipe's ingredients (~10-20 items) should complete in <500ms of Worker CPU time.

### 12.4 Smart Rollup — Computed at Read Time

Rollup is not stored; it is computed when the shopping list is fetched. For a list with 50-100 items (typical), this is a lightweight in-memory groupBy + reduce operation — negligible latency.

If lists grow very large (500+ items), rollup can be cached in KV with a short TTL and invalidated on any mutation.

### 12.5 Durable Objects — Shopping List Collaboration

- Durable Objects are single-threaded and colocated with the first user who connects. If collaborators are geographically distant, one will experience higher latency.
- For the shopping list use case, this is acceptable — operations are simple (check/uncheck items) and latency tolerance is high (~200-500ms is fine).
- WebSocket Hibernation API ensures DOs are not billed when idle.

### 12.6 Caching Strategy Summary

| Data | Cache Layer | TTL | Invalidation |
|---|---|---|---|
| Recipe detail (KV) | RECIPES_KV | Indefinite | Updated on re-crawl |
| Recipe list pages | Edge cache (CF) | 1 hour | Purge on projection |
| Dietary-filtered feeds | USER_CACHE_KV | 15 min | Time-based expiry |
| Session tokens | SESSION_KV | 30 days | Explicit delete on logout/rotation |
| Recommendations | USER_CACHE_KV | 24 hours | Recomputed daily |
| Rating aggregates | In recipe KV doc | Indefinite | Updated async via Queue |
| Shopping list state | Durable Object memory | While active | Persisted to D1 on mutation |

---

## 13. Open Questions & Risks

### Open Questions

| # | Question | Impact | Proposed Resolution |
|---|---|---|---|
| 1 | **Dietary flag accuracy.** Many recipes lack explicit dietary tags. How accurate will ingredient-based inference be? | Users may see non-compliant recipes or miss compliant ones. | Start conservative (only flag when confident). Add a "Report incorrect dietary info" button. Build a crowd-sourced correction mechanism in Phase 2. |
| 2 | **Google SSO only.** Should we support Apple Sign-In or email/password? | iOS App Store may require Apple Sign-In. Reduces addressable audience. | Add Apple Sign-In before iOS App Store submission (required by Apple review guidelines if any third-party SSO is offered). Email/password is out of scope — adds password storage, reset flows, and security surface area. |
| 3 | **D1 row limits.** D1 databases have a 10GB storage limit. Will user data fit? | At scale (100k+ users with heavy usage), could approach limits. | Monitor storage. User data is much smaller than recipe data. Shopping list items are the largest table — add a per-user item limit (1000 items across all lists). |
| 4 | **Durable Object cost.** DOs are billed per request + duration. How expensive is real-time collaboration? | Could be significant if many users keep WebSocket connections open. | WebSocket Hibernation API minimises duration billing. Monitor usage and add connection limits if needed. |
| 5 | **Ingredient parsing quality.** Regex-based parsing will fail on unusual formats ("a pinch of salt", "juice of 2 lemons"). | Poor parsing degrades shopping list usability. | Track `parse_failed` rate. If >15% of items fail, invest in a more sophisticated parser (possibly ML-based via Workers AI in Phase 4). |
| 6 | **Cross-DB consistency.** Rating aggregates live in both Users D1 and Recipes D1. What if they drift? | Users see stale or incorrect ratings. | The Queue-based sync is designed to be idempotent and retryable. Add a reconciliation cron job (weekly) that recomputes all aggregates from source ratings. |
| 7 | **FTS + dietary filtering.** Can we efficiently combine FTS5 search with dietary flag filtering? | Search results may not respect dietary prefs, or may be slow. | Test with: `SELECT ... FROM recipes_fts JOIN recipes r JOIN recipe_dietary_flags rdf WHERE recipes_fts MATCH ? AND rdf.is_X = 1`. If slow, filter post-FTS (fetch more results, filter in-app, paginate). |
| 8 | **Shopping list sharing auth model.** Share tokens have no expiry and no access control beyond "anyone with the link". | Leaked links grant permanent edit access. | Add optional expiry (`share_expires_at`). Add a "viewers" mode vs "editors" mode in a future iteration. |

### Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| D1 performance under dietary filter joins | High | Medium | Partial indexes, KV caching fallback, benchmarking before launch |
| Google changes OAuth2 flow or deprecates endpoints | Medium | Low | Use standard OIDC. Minimal dependency on Google-specific APIs. |
| Spam/abuse of reviews before moderation tools mature | Medium | Medium | Automated prevention (blacklist, rate limit, interaction gate) ships before reviews go live. Manual moderation is a known gap until admin tooling is built. |
| MMKV data loss on mobile (app uninstall, storage pressure) | Medium | Medium | Bookmarks are synced to server. Local data is a cache, not the source of truth. User is warned that uninstalling clears offline data. |
| Durable Object region placement causes latency for one collaborator | Low | High | Acceptable for shopping lists. Document the limitation. |
| Ingredient parser produces incorrect quantities (2x or 0.5x) | Medium | Medium | Show `original_text` alongside parsed display. Users can edit quantities manually. |
| Scope creep from Phase 4 AI features | High | High | Phase 4 is explicitly gated behind Phases 1-3 data accumulation. Do not start until sufficient user data exists. Spec will be refined closer to implementation. |

---

## Appendix A: Unit Normalisation Table

Used by the ingredient parser (Phase 3):

| Input Variants | Canonical Unit |
|---|---|
| `tsp`, `t`, `teaspoons` | `teaspoon` |
| `tbsp`, `T`, `tbs`, `tablespoons` | `tablespoon` |
| `c`, `cups` | `cup` |
| `oz`, `ounces` | `ounce` |
| `lb`, `lbs`, `pounds` | `pound` |
| `g`, `grams`, `grammes` | `gram` |
| `kg`, `kilograms` | `kilogram` |
| `ml`, `milliliters`, `millilitres` | `milliliter` |
| `l`, `liters`, `litres` | `liter` |
| `pt`, `pints` | `pint` |
| `qt`, `quarts` | `quart` |
| `gal`, `gallons` | `gallon` |
| `fl oz`, `fluid ounces` | `fluid ounce` |
| `pinch`, `pinches` | `pinch` |
| `dash`, `dashes` | `dash` |
| `clove`, `cloves` | `clove` |
| `bunch`, `bunches` | `bunch` |
| `can`, `cans` | `can` |
| `package`, `packages`, `pkg` | `package` |
| `slice`, `slices` | `slice` |
| `piece`, `pieces`, `pc`, `pcs` | `piece` |
| `sprig`, `sprigs` | `sprig` |
| `head`, `heads` | `head` |
| `stalk`, `stalks` | `stalk` |
| `stick`, `sticks` | `stick` |

## Appendix B: Unit Conversion Table

For smart rollup cross-unit aggregation:

| From | To | Factor |
|---|---|---|
| teaspoon | tablespoon | 0.333... |
| tablespoon | cup | 0.0625 |
| cup | quart | 0.25 |
| quart | gallon | 0.25 |
| ounce | pound | 0.0625 |
| gram | kilogram | 0.001 |
| milliliter | liter | 0.001 |
| fluid ounce | cup | 0.125 |

Only convert when both units are in the same measurement system (volume-to-volume or weight-to-weight). Never convert weight to volume (e.g., cups of flour to grams) — this requires ingredient-specific density data and is out of scope.

## Appendix C: Blacklisted Words — Review Spam Prevention

The blacklist is maintained as a JSON file in `@rr/shared/data/review-blacklist.json`. It is not included in this spec for brevity but should contain:

- Common profanity (~200 terms)
- Spam indicators: URLs, email addresses, phone numbers (detected via regex)
- Commercial spam: "buy", "discount", "coupon", "promo code", "click here", "visit my site"
- Gibberish detection: strings with >3 consecutive consonants or >50% non-alphabetic characters

The blacklist is checked server-side only. It is never sent to the client.

## Appendix D: Recipe View Tracking

To support Phase 4 recommendations, start collecting recipe views in Phase 1:

```typescript
// In the GET /recipes/:id handler, after optionalAuth middleware:
if (c.get('userId')) {
  // Fire-and-forget — do not await, do not block the response
  c.executionCtx.waitUntil(
    c.env.USERS_DB.prepare(
      'INSERT INTO recipe_views (id, user_id, recipe_id, viewed_at) VALUES (?1, ?2, ?3, ?4)'
    ).bind(crypto.randomUUID(), c.get('userId'), id, new Date().toISOString()).run()
  );
}
```

This adds no latency to the recipe detail endpoint. Views are deduplicated in the recommendation engine (not at write time — simpler and cheaper).
