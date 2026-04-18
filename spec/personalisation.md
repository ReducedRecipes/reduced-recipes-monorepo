# ReducedRecipes — Personalisation, Social & Commerce Specification

**Version:** 2.0
**Date:** 2026-04-16
**Status:** Draft
**Depends on:** [Initial Spec](./inital-spec.md) · [Mobile App Spec](./mobile-app.md)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Phased Milestones](#2-phased-milestones)
3. [Phase 1a — Auth, User Profiles, Dietary Preferences, Simple Bookmarks](#3-phase-1a--auth-user-profiles-dietary-preferences-simple-bookmarks)
4. [Phase 1b — Collections, Follow System, Offline Bookmark Sync](#4-phase-1b--collections-follow-system-offline-bookmark-sync)
5. [Phase 2 — Shopping Lists](#5-phase-2--shopping-lists)
6. [Phase 3 — Ratings & Reviews](#6-phase-3--ratings--reviews)
7. [Phase 4 — AI-Assisted Recommendations & Meal Planning](#7-phase-4--ai-assisted-recommendations--meal-planning)
8. [Database Schema](#8-database-schema)
9. [API Endpoint Design](#9-api-endpoint-design)
10. [Technical Architecture](#10-technical-architecture)
11. [Security Considerations](#11-security-considerations)
12. [GDPR Compliance](#12-gdpr-compliance)
13. [Performance Considerations](#13-performance-considerations)
14. [Open Questions & Risks](#14-open-questions--risks)

---

## 1. Executive Summary

ReducedRecipes currently serves ~60,000 recipes crawled from 400+ domains via a fully anonymous, read-only experience. This specification adds four phases of personalisation and social features that transform the product from a recipe viewer into a cooking companion:

- **Phase 1a** introduces CF-native authentication (Google SSO with PKCE), user profiles, dietary preference filtering via Workers AI, and simple bookmarks (single "Saved" list) — the foundational identity layer everything else builds on.
- **Phase 1b** adds collections/folders for organising bookmarks, a follow system, and offline bookmark sync for mobile.
- **Phase 2** delivers structured shopping lists with ingredient parsing, smart rollup/deduplication, shareable links with expiry, real-time collaboration via Durable Objects, and offline usage.
- **Phase 3** adds public ratings and text reviews (merged into a single table) with spam prevention, creating community-driven quality signals.
- **Phase 4** layers on AI-powered recipe recommendations and meal planning, leveraging the user behaviour data accumulated in Phases 1-3.

All user data lives in a **separate D1 database** (`reduced-recipes-users`) from the recipes database (`reduced-recipes-prod`). The system is GDPR-compliant with full data export, account deletion, and explicit consent records.

### Design Principles

1. **Browse freely, sign in to interact.** No gate on reading; CTAs appear when unauthenticated users attempt to bookmark, rate, or save. The `return_to` / `intent` parameter in the OAuth state preserves pre-auth actions so they auto-complete after sign-in.
2. **Dietary restrictions are hard filters by default.** If a user marks "Gluten-Free", non-matching recipes vanish from every view — search, browse, recommendations — without degrading query performance. A "soft filter" escape hatch highlights matches instead of hiding non-matches.
3. **Offline-first on mobile.** Bookmarked recipes are available offline. Shopping lists sync when connectivity returns. Last-write-wins conflict resolution keeps the model simple.
4. **CF-native throughout.** Workers, D1, KV, Durable Objects, Queues, R2, Workers AI. No third-party auth services, no external databases.
5. **Multi-provider auth from day one.** The `user_auth_providers` join table supports Google now and Apple Sign-In in future without schema migrations.

### Client-Side State Management

Both web and mobile share a consistent state strategy:

| Layer | Technology | Scope |
|---|---|---|
| Server cache | TanStack Query | All API data — recipes, bookmarks, reviews, lists. Both platforms. |
| Auth state + offline queue | Zustand | Auth tokens, user object, pending offline mutations. Both platforms. |
| WebSocket state | `useShoppingListSocket` hook | Real-time shopping list collaboration. Dedicated hook manages connection lifecycle, reconnection, and message buffering. |
| Component-local state | React `useState` / `useReducer` | UI-only state (modals, form inputs, animation flags). |

A shared API client is extracted to `@rr/shared/api-client.ts` to ensure consistent request/response handling, header injection (auth, dietary prefs, CSRF), and error mapping across both platforms.

---

## 2. Phased Milestones

### Phase 1a — Identity & Simple Bookmarks ✅ Completed 2026-04-18

| Deliverable | Status | Notes |
|---|---|---|
| Auth Worker | ✅ Done | Google SSO + PKCE on Hono API worker. Platform-aware: cookies for web, Bearer for mobile. Session KV with 30-day TTL, PKCE code_challenge via crypto.subtle. `requireAuth`/`optionalAuth` middleware. |
| User profiles | ✅ Done | `GET /users/:id`, `PATCH /users/me`, `DELETE /users/me` (GDPR), `GET /users/me/export`. Profile page on web frontend. |
| Onboarding flow | ✅ Done | Post-signup dietary onboarding modal on web. 16 dietary restriction chips with live matching recipe count. |
| Dietary filtering | ✅ Done | Bitmask filtering on `/recipes`, `/search`, `/domains/:domain/recipes`. Workers AI inference pipeline in projection worker classifies recipes. `X-Dietary-Prefs` header for guests. |
| Simple bookmarks | ✅ Done | `POST/DELETE/GET /bookmarks` with default "Saved" collection. BookmarkButton on recipe detail pages (web). |
| Privacy controls | ✅ Done | `profile_public` toggle on user profile. Public/private profile visibility. |
| Notifications table | ✅ Done | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/unread-count`. NotificationBell component on web. |
| Consent records | ✅ Done | `consent_records` table. Terms + privacy consent auto-recorded on sign-up with IP + User-Agent. |
| Recipe view tracking | ✅ Done | Fire-and-forget `INSERT OR IGNORE` into `recipe_views` on `GET /recipes/:id` for authed users. Deduped by user+recipe+date. |
| Security headers | ✅ Done | CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy on all responses. |
| CORS | ✅ Done | Dynamic origin matching for `*.reduced-recipes.pages.dev` and `*.workers.dev` preview URLs. |
| Mobile auth store | ✅ Done | Zustand + expo-secure-store persistence. Mobile onboarding dietary flow and settings account section built. |
| Frontend auth | ✅ Done | Auth store with localStorage token persistence. LoginButton, LoginCallbackPage, ProfilePage, SettingsPage with dietary toggles and data export. |

**Infrastructure created:**
- D1 database: `reduced-recipes-users` (preview: `reduced-recipes-users-preview`)
- KV namespaces: `rr-sessions`, `rr-user-cache` (preview variants created)
- Workers AI binding for dietary inference
- Preview deploy workflow (`.github/workflows/deploy-preview.yml`)
- Preview API: `https://rr-api-preview.nikrich.workers.dev`
- Preview frontend: `https://preview.reduced-recipes.pages.dev`

**PRs merged to feature branch:** #119–#162 (44 PRs total across backend, frontend, mobile)

### Phase 1b — Collections, Follows & Offline Sync (Weeks 5-7)

| Deliverable | Description |
|---|---|
| Collections/folders | Organise bookmarks into named collections beyond the default "Saved" |
| Follow system | Follow users to discover their public collections |
| Offline bookmarks (mobile) | MMKV-backed offline storage with last-write-wins sync |
| Search within bookmarks | Full-text search across bookmarks and collections |

### Phase 2 — Shopping Lists (Weeks 8-13)

| Deliverable | Description |
|---|---|
| Shopping list CRUD | Multiple lists with a default list |
| Ingredient parsing | Reuses dietary inference infrastructure: rule-based pre-pass + Workers AI for ambiguous items |
| Smart rollup | Cross-recipe ingredient deduplication and quantity aggregation |
| Manual items | Users can add free-text items to any list |
| Check-off | Mark items as purchased while shopping |
| Shareable links | Share tokens with full edit access, 7-day default expiry (renewable by owner) |
| Real-time collaboration | Durable Objects for live multi-user editing with sequence-based reconnection |
| Offline shopping lists | Local cache with offline check/uncheck, queued mutations, batch sync endpoint |
| Deep linking | Universal links / App Links for shared shopping list URLs |

### Phase 3 — Ratings & Reviews (Weeks 14-18)

| Deliverable | Description |
|---|---|
| Star ratings | 1-5 star public ratings with aggregate scores |
| Text reviews | Optional text alongside ratings (merged table), displayed with user name + avatar |
| Top Rated section | Global leaderboard of highest-rated recipes |
| Spam prevention | Blacklisted words, PII detection, server-verifiable interaction gating, rate limiting, review bombing detection |
| Report/flag system | Users can flag reviews for moderation; flagged review outcome notifications |
| Content sanitisation | Server-side HTML stripping and special character encoding at write time |

### Phase 4 — AI Features (Weeks 19-24)

| Deliverable | Description |
|---|---|
| Recommendation engine | Personalised recipe suggestions based on bookmarks, ratings, history |
| Meal planner | "Plan my week" generates 7-day meal plan respecting dietary prefs |
| Shopping list generation | Meal plan auto-generates a consolidated shopping list |
| Repetition avoidance | Considers recently cooked recipes to avoid monotony |
| Recipe scaling | Future enhancement: scale ingredient quantities using parsed ingredient data model |

---

## 3. Phase 1a — Auth, User Profiles, Dietary Preferences, Simple Bookmarks

### 3.1 Authentication

#### Flow: Google SSO with PKCE

All OAuth flows implement PKCE (RFC 7636). The server generates and stores `code_verifier` in KV keyed by the `state` parameter, then sends `code_challenge` to Google. This prevents authorization code interception attacks.

```
[Client] ─── GET /api/v1/auth/google/url?platform=web&return_to=/recipe/abc ──► [Auth Worker]
  Auth Worker:
    1. Generate state (HMAC-signed nonce)
    2. Generate code_verifier + code_challenge (S256)
    3. Store in KV: AUTH_STATE_KV.put(`auth-state:{state}`, JSON.stringify({
         code_verifier, platform, return_to, intent
       }), { expirationTtl: 600 })
    4. Build Google OAuth URL with code_challenge, code_challenge_method=S256
         ◄── { url: "https://accounts.google.com/o/oauth2/v2/auth?...&code_challenge=...&code_challenge_method=S256" }

[Client] ─── redirect to Google ─────────────────────► [Google]
         ◄── redirect to /auth/callback?code=...&state=... ──────

[Client] ─── GET /api/v1/auth/google/callback?code=XYZ&state=ABC ─► [Auth Worker]
  Auth Worker:
    1. Verify state HMAC signature
    2. Retrieve auth-state:{state} from KV (includes code_verifier, platform, return_to)
    3. Exchange code + code_verifier for tokens (Google tokeninfo endpoint)
    4. Extract: sub (provider_id), email, name, picture
    5. UPSERT user in D1 (users + user_auth_providers tables)
    6. Generate opaque session_token (crypto.randomUUID + timestamp)
    7. Store session in KV: SESSION_KV.put(`session:{token}`, JSON.stringify(session), { expirationTtl: 2592000 })
    8. Add to reverse index: update `user-sessions:{user_id}` JSON array with new token key
    9. Platform-dependent response:
       - Web: 302 redirect to return_to URL with Set-Cookie header
              (httpOnly, Secure, SameSite=Strict). Token NEVER in JSON body on web.
       - Mobile: 200 JSON response with { session_token, user, is_new_user }
```

#### Platform-Aware Token Delivery

| Platform | Token Storage | Token Transmission | CSRF Required |
|---|---|---|---|
| **Web** | httpOnly + Secure + SameSite=Strict cookie | Automatic via cookie | Yes — Origin header validation on state-changing requests |
| **Mobile** | expo-secure-store (SecureStore) | `Authorization: Bearer {token}` header | No — Bearer tokens are not auto-attached |

The API middleware reads auth from **cookie first**, then falls back to **Bearer header**. This allows a single API to serve both platforms transparently.

#### Session Management

- **Storage:** KV namespace `SESSION_KV`, key `session:{token}`, TTL 30 days.
- **Token format:** Opaque — `{uuid_v4}.{timestamp_hex}`. No user_id embedded in the token itself. The session payload in KV contains the user_id.
- **Reverse index:** KV key `user-sessions:{user_id}` stores a JSON array of active `session:{token}` keys. Used for efficient session cleanup on logout-all and account deletion.
- **Refresh:** On each authenticated request, if the session is older than 7 days, issue a new token. The old token remains alive with a **60-second grace TTL** pointing to `{ replacement_token: newToken }`. This prevents in-flight requests from failing during rotation. The new session's `created_at` is updated to the current time.
- **Logout:** Delete the KV key. Remove from `user-sessions:{user_id}` array. Client discards the token / clears cookie.
- **Pre-auth intent preservation:** The `state` parameter in the OAuth flow carries `return_to` (URL to redirect after auth) and `intent` (action to auto-complete, e.g., `{ action: 'bookmark', recipe_id: 'abc' }`). After successful auth, the client reads the intent and completes the action automatically.

#### Auth Rate Limiting

| Endpoint | Limit | Scope |
|---|---|---|
| `GET /auth/google/url` | 10 requests / minute | Per IP |
| `GET /auth/google/callback` | 5 requests / minute | Per IP |

Enforced via CF Rate Limiting rules at the edge.

#### Auth Middleware (pseudocode)

```typescript
const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = extractToken(c); // cookie first, then Bearer header
  if (!token) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in required' } }, 401);

  const raw = await c.env.SESSION_KV.get(`session:${token}`, 'text');
  if (!raw) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Session expired' } }, 401);

  const session = JSON.parse(raw);

  // Handle grace-period tokens (old token during refresh)
  if (session.replacement_token) {
    c.header('X-New-Session-Token', session.replacement_token);
    const newRaw = await c.env.SESSION_KV.get(`session:${session.replacement_token}`, 'text');
    if (newRaw) {
      const newSession = JSON.parse(newRaw);
      c.set('userId', newSession.user_id);
      c.set('user', newSession.user);
      await next();
      return;
    }
  }

  c.set('userId', session.user_id);
  c.set('user', session.user);

  // Refresh if older than 7 days
  const ageMs = Date.now() - session.created_at;
  if (ageMs > 7 * 24 * 60 * 60 * 1000) {
    const newToken = `${crypto.randomUUID()}.${Date.now().toString(16)}`;
    const newSession = { ...session, created_at: Date.now() };
    await c.env.SESSION_KV.put(`session:${newToken}`, JSON.stringify(newSession), { expirationTtl: 2592000 });
    // Keep old token alive with grace TTL
    await c.env.SESSION_KV.put(`session:${token}`, JSON.stringify({ replacement_token: newToken }), { expirationTtl: 60 });
    // Update reverse index
    await updateSessionIndex(c.env.SESSION_KV, session.user_id, token, newToken);
    c.header('X-New-Session-Token', newToken);
    // Web: also set updated cookie
    if (!c.req.header('Authorization')) {
      setCookie(c, 'session', newToken, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge: 2592000 });
    }
  }

  await next();
};

// Helper: extract token from cookie or Bearer header
function extractToken(c: Context): string | null {
  // Cookie first (web)
  const cookie = getCookie(c, 'session');
  if (cookie) return cookie;
  // Bearer header fallback (mobile)
  return c.req.header('Authorization')?.replace('Bearer ', '') ?? null;
}

// Optional variant — does not block, just attaches user if present
const optionalAuth: MiddlewareHandler = async (c, next) => {
  const token = extractToken(c);
  if (token) {
    const raw = await c.env.SESSION_KV.get(`session:${token}`, 'text');
    if (raw) {
      const session = JSON.parse(raw);
      if (session.replacement_token) {
        const newRaw = await c.env.SESSION_KV.get(`session:${session.replacement_token}`, 'text');
        if (newRaw) {
          const newSession = JSON.parse(newRaw);
          c.set('userId', newSession.user_id);
          c.set('user', newSession.user);
        }
      } else {
        c.set('userId', session.user_id);
        c.set('user', session.user);
      }
    }
  }
  await next();
};
```

### 3.2 User Profiles

#### Data Model

Users have a minimal profile auto-populated from their auth provider:

- `id` — UUIDv4 generated server-side
- `email` — from provider
- `name` — from provider (display name)
- `picture_url` — from provider (profile picture URL)
- `profile_public` — boolean, default `true`
- `tier` — text, default `'free'` (supports future freemium model)
- `created_at`, `updated_at`

Provider-specific data (google_id, provider email, etc.) lives in the `user_auth_providers` join table, enabling Apple Sign-In or additional providers without schema changes.

#### Profile Page

The public profile page (`/user/{id}`) shows:

- Name + profile picture
- Join date
- Public collections (if profile is public) — Phase 1b
- Reviews written (if profile is public) — Phase 3
- Follower/following counts — Phase 1b

If the profile is private, only the user's name and picture are visible.

### 3.3 Dietary Preferences

#### Onboarding

After first sign-in (`is_new_user: true`), the client shows a full-screen onboarding modal:

1. "Welcome to ReducedRecipes! Let's personalise your experience."
2. Grid of dietary restriction chips — multi-select.
3. **Live count of matching recipes** shown below the chips. If very few recipes match (<50), display a warning: "Only N recipes match your filters. You can change this anytime in Settings."
4. "These are hard filters — recipes that don't match will be hidden from all views."
5. Skip option: "No restrictions" button.

#### Dietary Restriction Categories

| Bit | Label | Bitmask Value |
|---|---|---|
| 0 | Vegetarian | `1` |
| 1 | Vegan | `2` |
| 2 | Gluten-Free | `4` |
| 3 | Dairy-Free | `8` |
| 4 | Nut-Free | `16` |
| 5 | Keto | `32` |
| 6 | Halal | `64` |
| 7 | Kosher | `128` |
| 8 | Low-Carb | `256` |
| 9 | Paleo | `512` |
| 10 | Pescatarian | `1024` |
| 11 | Egg-Free | `2048` |
| 12 | Soy-Free | `4096` |
| 13 | Shellfish-Free | `8192` |
| 14 | Low-Sodium | `16384` |
| 15 | Sugar-Free | `32768` |

#### Dietary Inference — Workers AI Pipeline

Rather than manual tagging, dietary flags are inferred from each recipe's ingredients using a two-stage pipeline:

**Stage 1 — Rule-based pre-pass (free):**
A deterministic rules engine scans the ingredient list for obvious indicators. For example, `chicken`, `beef`, `pork` immediately disqualify `vegetarian`; `milk`, `butter`, `cheese` disqualify `dairy-free`. This catches ~70% of cases with zero cost.

**Stage 2 — Workers AI for ambiguous items (practically free):**
Ingredients that survive the rules engine (e.g., "Worcestershire sauce" — contains anchovies, not obvious) are batched and sent to `@cf/meta/llama-3.1-8b-instruct` with a structured prompt asking for dietary flag classifications. Workers AI is included in the Workers Paid plan with generous free tiers.

**Pipeline execution:**
- **One-off migration:** Run across all ~60,000 existing recipes to populate `dietary_bitmask`.
- **Ongoing:** Run during the recipe parse/projection phase for each new recipe.
- **Reuse:** The same ingredient parsing infrastructure (rule-based + Workers AI) is reused in Phase 2 for shopping list ingredient structuring.

#### Filtering Implementation — Bitmask Approach

Instead of per-flag boolean columns with partial indexes, a single INTEGER column `dietary_bitmask` stores all dietary flags as a bitmask. Each bit position corresponds to a dietary restriction.

**Recipes DB schema addition:**

```sql
ALTER TABLE recipes ADD COLUMN dietary_bitmask INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_recipes_dietary_bitmask ON recipes(dietary_bitmask);
```

**Query modification:** When a user has dietary preferences, the API computes a `user_mask` from their selected restrictions and injects a bitwise AND condition:

```sql
-- User has: vegetarian (bit 0 = 1) + gluten-free (bit 2 = 4), so user_mask = 5
SELECT r.*
FROM recipes r
WHERE (r.dietary_bitmask & :user_mask) = :user_mask
  AND r.extracted_at < ?  -- cursor
ORDER BY r.extracted_at DESC
LIMIT 25;
```

This is efficient because:
- A single index scan on `dietary_bitmask` handles any combination of dietary flags.
- No JOIN required — the bitmask lives directly on the recipes table.
- Scales to any combination of preferences without additional indexes.
- D1's SQLite engine handles bitwise operations natively.

**KV cache layer:** For common preference combinations (e.g., "vegetarian"), cache the first few pages of results in KV with a 15-minute TTL. Cache key: `dietary-feed:{user_mask}:{cursor}`.

#### Dietary Preference Authority

- **Authenticated users:** The server is authoritative. Dietary preferences are looked up from D1, cached in KV with a **1-hour TTL** (`user-dietary:{user_id}`). The `X-Dietary-Prefs` header is ignored for authenticated users.
- **Unauthenticated users:** The `X-Dietary-Prefs` header is used as a hint (comma-separated list, e.g., `vegetarian,gluten-free`). This enables guest filtering without an account.

#### Settings — Change Preferences

Users can modify their dietary preferences at any time via Settings > Dietary Preferences. The client updates the local state immediately and PUTs to the server. The KV cache is invalidated.

#### Soft Filter Toggle

Settings includes a toggle: **"Show all recipes (matches highlighted)"** vs **"Only show matching"** (default). When soft filter is enabled, non-matching recipes are shown but visually de-emphasised (greyed out, no dietary badge). The toggle is stored as `soft_filter` on the user's preferences.

### 3.4 Simple Bookmarks

In Phase 1a, bookmarks use a single flat "Saved" list. There are no collections or folders yet — those come in Phase 1b.

#### Quick Bookmark

Tapping the bookmark icon on a recipe card adds it to the default "Saved" list. The `bookmarks` table stores `user_id`, `recipe_id`, and timestamps. The `collection_id` column exists in the schema but is set to the default collection for all Phase 1a bookmarks.

#### Bookmark Count on Recipe Cards

Recipe cards show the total bookmark count (across all users) as a lightweight popularity signal.

---

## 4. Phase 1b — Collections, Follow System, Offline Bookmark Sync

### 4.1 Collections

```
User
 └── Collection (folder)
      └── Bookmark (recipe reference)
```

Every user has a default "Saved" collection (created in Phase 1a) that cannot be deleted or renamed. Users can now create additional named collections (e.g., "Weeknight Dinners", "Date Night", "Holiday Baking").

#### Organising Bookmarks

- Long-press (mobile) or dropdown (web) on a bookmark lets the user move it to a specific collection.
- Bookmarks can exist in multiple collections (the UNIQUE constraint is on `(user_id, collection_id, recipe_id)`).

#### Collection Visibility

Collections inherit the user's profile visibility setting. If the profile is public, collections are visible to followers on the profile page. Users can override visibility per-collection (public/private).

#### Search Within Bookmarks

`GET /api/v1/bookmarks/search?q=chicken&collection_id=optional` provides full-text search across a user's bookmarked recipe titles and descriptions.

### 4.2 Follow System

Users can follow other users to discover their public collections. Following is one-directional (not mutual). The follow action appears on public profiles.

### 4.3 Offline Bookmark Support (Mobile)

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

---

## 5. Phase 2 — Shopping Lists

### 5.1 Data Model

```
User
 └── ShoppingList
      ├── ShoppingListItem (parsed ingredient or manual)
      └── ShoppingListRecipe (link to source recipe)
```

Every user has a default shopping list ("Shopping List") that cannot be deleted. Users can create additional lists. Each collection can also have an associated shopping list (1:1 relationship via `collection_id` on the shopping list).

### 5.2 Ingredient Parsing

Recipe ingredients from schema.org are stored as free-text strings (e.g., `"2 cups all-purpose flour"`). Parsing reuses the same infrastructure built for dietary inference in Phase 1a.

**Parsing pipeline:**

```
[User adds recipe to shopping list]
       │
       ▼
[API writes ShoppingListRecipe row + creates temporary items with parsing:true flag]
[API returns immediately with raw ingredient strings as temporary items]
[Enqueues INGREDIENT_PARSE_QUEUE]
       │
       ▼
[Worker: Ingredient Parser]
  1. Fetch recipe ingredients from KV
  2. Stage 1 — Rule-based parser:
     - Regex handles common patterns: {quantity} {unit} {item}, {quantity} {item}, {item}
     - Fractions: 1/2 → 0.5, 1 1/2 → 1.5
     - Ranges: 2-3 cloves garlic → quantity 2.5, item garlic, unit clove
     - Parenthetical notes stripped: 1 cup butter (melted) → quantity 1, unit cup, item butter
  3. Stage 2 — Workers AI (@cf/meta/llama-3.1-8b-instruct) for ambiguous items:
     - Items where the rule-based parser is uncertain
     - Structured output: { quantity, unit, item, category }
  4. Replace temporary items with parsed ShoppingListItem rows in Users DB
  5. If parsing fails for an item, store as manual entry with original_text and parse_failed = true
  6. Notify connected WebSocket clients that parsing is complete
```

**Loading state:** When the API returns immediately after adding a recipe, it includes the raw ingredient strings as temporary items with a `parsing: true` flag. The client displays these with a loading indicator. When parsing completes, the WebSocket or a poll delivers the structured items, replacing the temporary ones.

**Unit normalisation table:** `tbsp` -> `tablespoon`, `oz` -> `ounce`, `c` -> `cup`, etc. (See Appendix A.)

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

- `POST /api/v1/shopping-lists/:id/share` generates a share token (crypto.randomUUID) with **full edit access**.
- The token is stored on the shopping list row: `share_token` + `share_expires_at`.
- **Default expiry: 7 days.** The owner can renew the share token, which resets the expiry.
- Anyone with the URL `/shared/list/{share_token}` can view and edit the list.
- The owner can revoke sharing: `DELETE /api/v1/shopping-lists/:id/share` nulls the token.
- **On revocation:** The ShoppingListDO must close all WebSocket connections authenticated via that token.
- No authentication required for shared list access — the token is the credential.

**Deep linking:** Shared shopping list URLs use universal links (iOS) and App Links (Android) so they open directly in the mobile app when installed. Configuration:

- iOS: `apple-app-site-association` at `/.well-known/apple-app-site-association`
- Android: `assetlinks.json` at `/.well-known/assetlinks.json`

### 5.7 Real-Time Collaboration (Durable Objects)

When two or more users are viewing the same shopping list (either the owner and a shared-link user, or multiple shared-link users), changes propagate in real time via WebSocket.

**Concurrent connection limit:** Maximum 10 WebSocket connections per shopping list.

**Architecture:**

```
[Client A] ──── WebSocket ──── [Durable Object: ShoppingList:{list_id}] ──── WebSocket ──── [Client B]
                                          │
                                          │ (batch persist to D1 every 1-2s)
                                          ▼
                                    [Users D1 DB]
```

**Durable Object: `ShoppingListDO`**

- One instance per shopping list (keyed by `list_id`).
- Maintains a list of connected WebSocket sessions.
- **Batched D1 writes:** Instead of writing to D1 on every mutation, the DO accumulates mutations in memory and flushes to D1 every 1-2 seconds. This reduces D1 write load during active editing sessions.
- On receiving a mutation message (add item, check item, remove item, update quantity):
  1. Validate the mutation.
  2. Apply to in-memory state (source of truth while DO is active).
  3. Queue for next D1 batch flush.
  4. Broadcast the mutation to all other connected sessions with a **sequence number**.
- On WebSocket connect, sends the full current state of the list.
- **Share token validation:** On connect, if authenticating via share token, verify `share_expires_at` has not passed. Periodically re-check (every 60 seconds) and disconnect expired share sessions.
- Idle timeout: If no connections for 60 seconds, the DO hibernates (Cloudflare handles this automatically with WebSocket Hibernation API). Before hibernating, flush any pending D1 writes.

**Reconnection protocol:**

- Server messages include a monotonically increasing `seq` number.
- On reconnect, the client sends `{ type: 'reconnect', last_seq: N }`.
- The DO checks its in-memory message buffer:
  - If all messages since `last_seq` are still buffered, replay them.
  - If the gap is too large (buffer overflow), send a full `state` snapshot instead.

**Message protocol (JSON over WebSocket):**

```typescript
// Client → Server
type ClientMessage =
  | { type: 'add_item'; item: { text: string } }
  | { type: 'check_item'; item_id: string; checked: boolean }
  | { type: 'remove_item'; item_id: string }
  | { type: 'update_quantity'; item_id: string; quantity: number }
  | { type: 'uncheck_all' }
  | { type: 'reconnect'; last_seq: number };

// Server → Client
type ServerMessage =
  | { type: 'state'; items: ShoppingListItem[]; seq: number }
  | { type: 'item_added'; item: ShoppingListItem; seq: number }
  | { type: 'item_checked'; item_id: string; checked: boolean; seq: number }
  | { type: 'item_removed'; item_id: string; seq: number }
  | { type: 'item_updated'; item: ShoppingListItem; seq: number }
  | { type: 'all_unchecked'; seq: number }
  | { type: 'parsing_complete'; items: ShoppingListItem[]; seq: number }
  | { type: 'error'; message: string };
```

### 5.8 Offline Shopping List Usage

Shopping lists are cached locally for offline use:

1. When a user opens a shopping list, the full list state is cached in MMKV.
2. **Check/uncheck works against the local cache** — no network required.
3. Other mutations (add, remove, edit) are queued in the offline mutation queue (Zustand store, persisted to MMKV).
4. When connectivity returns, mutations are replayed:
   - Real-time mutations go through the WebSocket if connected.
   - Batch mutations use `POST /api/v1/sync/shopping-list-items`.

**Batch sync endpoint:** `POST /api/v1/sync/shopping-list-items`

```json
{
  "shopping_list_id": "uuid",
  "mutations": [
    { "type": "check_item", "item_id": "uuid", "checked": true, "client_timestamp": "..." },
    { "type": "add_item", "text": "milk", "client_timestamp": "..." }
  ]
}
```

---

## 6. Phase 3 — Ratings & Reviews

### 6.1 Merged Ratings & Reviews

Ratings and reviews are stored in a **single `reviews` table** with a nullable `text` field. A rating-only entry has `text = NULL`; a review has both a rating and text.

- **Scale:** 1-5 stars, integer only.
- **Constraint:** One entry per user per recipe. Re-rating overwrites the previous value.
- **Text length:** 10-2000 characters (when text is provided).
- **Display:** Reviews show the user's name, profile picture, star rating, review text (if any), and timestamp.
- **Ordering:** Most recent first, with an option to sort by rating (high-to-low, low-to-high).

### 6.2 Aggregate Rating Storage

To avoid computing aggregates on every recipe card render, rating aggregates are denormalised:

- **Users DB:** `recipe_rating_aggregates` table holds `recipe_id`, `rating_sum`, `rating_count`.
- **Recipes DB:** The projection worker reads these aggregates and writes `avg_rating` and `rating_count` into the recipes D1 row. This is updated asynchronously via a Queue job whenever a rating is submitted.
- **KV cache:** Recipe detail responses in KV include the latest aggregate. Updated via a Queue consumer that patches the KV document.
- **Top Rated section:** Recipes with `rating_count >= 5` ordered by `avg_rating DESC, rating_count DESC`.

### 6.3 Spam Prevention

| Measure | Implementation |
|---|---|
| **Interaction gate (server-verifiable)** | User must have the recipe bookmarked OR have a `recipe_views` entry older than 30 seconds. Both conditions are verified server-side against D1 — no client-side claims accepted. |
| **Blacklisted words** | Server-side list of ~500 blacklisted words/phrases. Review text is checked before insertion. Rejection returns a generic "Review could not be posted" message (does not reveal which word triggered it). |
| **PII detection** | Regex patterns detect phone numbers (`\b\d{3}[-.]?\d{3}[-.]?\d{4}\b` and international variants) and email addresses. Detected PII is stripped or the review is rejected. |
| **Content sanitisation** | Server-side at write time: strip all HTML tags, encode special characters (`<`, `>`, `&`, `"`, `'`). Stored text is always safe to render. |
| **Rate limiting** | Max 10 reviews per user per 24-hour window. Enforced via a KV counter: `review-ratelimit:{user_id}:{date}`. |
| **Minimum account age** | Account must be >24 hours old to submit a review. |
| **Review bombing detection** | Flag recipes that receive >N negative reviews (1-2 stars) within a time window (e.g., >5 negative reviews in 1 hour). Flagged recipes are queued for manual review. New reviews on flagged recipes require manual approval until the flag is cleared. |

**Note on language restrictions:** The original English-only restriction has been removed as it may be exclusionary to the user base. Instead, anti-spam is enforced through minimum account age, bookmark count requirements (account must have >=1 bookmark to review), and the interaction gate. This allows reviews in any language while still preventing spam from throwaway accounts.

### 6.4 Report / Flag System

- Any authenticated user can flag a review once (idempotent).
- Flags are stored in the `review_flags` table.
- Reviews with >= 3 flags are auto-hidden and queued for manual moderation.
- A simple admin endpoint lists flagged reviews for moderation: `GET /api/v1/admin/reviews/flagged`.
- Admin actions: `approve` (clears flags), `remove` (soft-deletes the review).
- **Notifications:** When a flagged review is resolved, the review author receives an in-app notification with the outcome.

---

## 7. Phase 4 — AI-Assisted Recommendations & Meal Planning

> Phase 4 is a separate feature set and will not be tightly integrated into shopping lists or other Phase 1-3 features initially. It is its own screen/flow.

### 7.1 Recommendation Engine

**Inputs:**
- User's bookmarked recipes (tags, cuisines, domains)
- User's ratings (what they rated highly)
- Recently viewed recipes (tracked via the `recipe_views` table)
- Dietary preferences (hard filters still apply)

**Algorithm (initial — non-ML):**
1. Build a user taste profile: weighted vector of tags, cuisines, and domains based on bookmarks (weight: 1), high ratings (weight: 2), and views (weight: 0.3).
2. Score each candidate recipe by cosine similarity to the user's taste vector.
3. Exclude recipes the user has already bookmarked or viewed in the last 7 days.
4. Apply dietary filters.
5. Return top-N candidates.

**Implementation:** Runs as a scheduled Worker (daily or on-demand). Pre-computes recommendations and stores them in KV: `recommendations:{user_id}` with a 24-hour TTL. The API serves from KV.

**Future (ML-based):** If usage warrants, replace the heuristic scorer with a CF Workers AI model or an external embedding-based approach. The API contract remains the same.

### 7.2 Meal Planner

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

### 7.3 Recipe Scaling (Future Enhancement)

The parsed ingredient data model from Phase 2 enables recipe scaling as a future enhancement. Users would select a serving multiplier (0.5x, 1x, 2x, 3x) and all parsed quantities would be recalculated. This requires no schema changes — it is a pure read-time transformation applied to the structured ingredient data.

### 7.4 Data Requirements

Phase 4 depends on sufficient user data from Phases 1-3:
- Minimum ~50 bookmarks or ratings per user for meaningful recommendations.
- The `recipe_views` table needs to be populated (Phase 1a should start tracking views).

---

## 8. Database Schema

### 8.1 Users Database (`reduced-recipes-users`)

This is a **separate D1 instance** from the recipes database.

```sql
-- =============================================
-- Migration 0001: Core user tables (Phase 1a)
-- =============================================

-- Users
CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  email           TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  picture_url     TEXT,
  profile_public  INTEGER NOT NULL DEFAULT 1,  -- 1 = public, 0 = private
  tier            TEXT NOT NULL DEFAULT 'free',  -- 'free', 'premium' (future)
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Auth providers (supports Google now, Apple/others later)
CREATE TABLE IF NOT EXISTS user_auth_providers (
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,  -- 'google', 'apple' (future)
  provider_id     TEXT NOT NULL,  -- Google sub, Apple sub, etc.
  provider_email  TEXT,
  provider_name   TEXT,
  provider_avatar TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, provider),
  UNIQUE (provider, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_uap_provider ON user_auth_providers(provider, provider_id);

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
  recipe_deleted_at TEXT,  -- set by recipe-deletion-fanout consumer
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, collection_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_collection ON bookmarks(collection_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_recipe ON bookmarks(recipe_id);

-- Follows (Phase 1b)
CREATE TABLE IF NOT EXISTS follows (
  follower_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

-- Recipe views (for recommendations in Phase 4, start collecting in Phase 1a)
-- Deduplicated: one view per user per recipe per calendar day
CREATE TABLE IF NOT EXISTS recipe_views (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'view',  -- 'view', 'cooked'
  viewed_at       TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_id, date(viewed_at))
);

CREATE INDEX IF NOT EXISTS idx_recipe_views_user ON recipe_views(user_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_recipe_views_recipe ON recipe_views(recipe_id);

-- Notifications (in-app bell, all phases)
CREATE TABLE IF NOT EXISTS notifications (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,  -- 'new_follower', 'review_reply', 'shared_list_update', 'flagged_review_outcome'
  payload         TEXT NOT NULL DEFAULT '{}',  -- JSON: { follower_id, review_id, list_id, etc. }
  read            INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- GDPR consent records
CREATE TABLE IF NOT EXISTS consent_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type    TEXT NOT NULL,  -- 'terms_of_service', 'privacy_policy', 'dietary_health_data'
  granted         INTEGER NOT NULL DEFAULT 1,  -- 1 = granted, 0 = withdrawn
  ip_address      TEXT,  -- recorded at time of consent for audit
  user_agent      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_consent_user ON consent_records(user_id, consent_type);
```

```sql
-- =============================================
-- Migration 0002: Shopping Lists (Phase 2)
-- =============================================

-- Shopping lists
CREATE TABLE IF NOT EXISTS shopping_lists (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id   TEXT REFERENCES collections(id) ON DELETE SET NULL,  -- optional tie to a collection
  name            TEXT NOT NULL,
  is_default      INTEGER NOT NULL DEFAULT 0,
  share_token     TEXT UNIQUE,  -- null = not shared, UUID = shared
  share_expires_at TEXT,  -- ISO datetime, null = no share or no expiry
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
  parsing          INTEGER NOT NULL DEFAULT 0,  -- 1 = currently being parsed (loading state)
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
-- Migration 0003: Reviews & Ratings (Phase 3)
-- =============================================

-- Merged reviews table (rating-only = text IS NULL)
CREATE TABLE IF NOT EXISTS reviews (
  id              TEXT PRIMARY KEY,  -- UUIDv4
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipe_id       TEXT NOT NULL,
  rating          INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text            TEXT CHECK (text IS NULL OR (length(text) >= 10 AND length(text) <= 2000)),
  status          TEXT NOT NULL DEFAULT 'active',  -- 'active', 'hidden', 'removed'
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, recipe_id)
);

CREATE INDEX IF NOT EXISTS idx_reviews_recipe ON reviews(recipe_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

-- Rating aggregates (denormalised for performance)
CREATE TABLE IF NOT EXISTS recipe_rating_aggregates (
  recipe_id       TEXT PRIMARY KEY,
  rating_sum      INTEGER NOT NULL DEFAULT 0,
  rating_count    INTEGER NOT NULL DEFAULT 0
);

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

### 8.2 Recipes Database Additions

These additions go into the existing `reduced-recipes-prod` D1 database:

```sql
-- =============================================
-- Migration 0003: Dietary bitmask (Phase 1a)
-- =============================================

-- Single bitmask column replaces per-flag boolean columns.
-- Each bit position corresponds to a dietary restriction (see Section 3.3).
ALTER TABLE recipes ADD COLUMN dietary_bitmask INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_recipes_dietary_bitmask ON recipes(dietary_bitmask);

-- Rating aggregates projected into recipes DB for display on recipe cards
ALTER TABLE recipes ADD COLUMN avg_rating REAL;
ALTER TABLE recipes ADD COLUMN rating_count INTEGER NOT NULL DEFAULT 0;
```

---

## 9. API Endpoint Design

All endpoints are served by the existing `rr-api` Worker at `reducedrecipes.com/api/v1/*`. New endpoints are added to the Hono app.

### 9.1 Phase 1a Endpoints

#### Auth

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/auth/google/url` | No | Returns Google OAuth2 consent URL with PKCE challenge |
| `GET` | `/auth/google/callback` | No | Exchanges auth code + PKCE verifier for session |
| `POST` | `/auth/logout` | Yes | Destroys session |
| `GET` | `/auth/me` | Yes | Returns current user profile |

**`GET /auth/google/url?platform=web&return_to=/recipe/abc`**

Response:
```json
{ "url": "https://accounts.google.com/o/oauth2/v2/auth?client_id=...&redirect_uri=...&scope=openid+email+profile&response_type=code&state=...&code_challenge=...&code_challenge_method=S256" }
```

**`GET /auth/google/callback?code=...&state=...`**

Web response: 302 redirect to `return_to` URL with `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`.

Mobile response (when `platform=mobile` in state):
```json
{
  "session_token": "a1b2c3d4-...",
  "user": {
    "id": "uuid",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "picture_url": "https://lh3.googleusercontent.com/...",
    "profile_public": true,
    "tier": "free",
    "created_at": "2026-04-16T10:00:00Z"
  },
  "is_new_user": true,
  "intent": { "action": "bookmark", "recipe_id": "abc" }
}
```

**`GET /auth/me`**

Response: Same `user` object as above.

#### User Profile

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/:id` | Optional | Get user's public profile |
| `PATCH` | `/users/me` | Yes | Update profile settings |
| `DELETE` | `/users/me` | Yes | Delete account (GDPR right to erasure) |
| `GET` | `/users/me/export` | Yes | Export all user data (GDPR right to access) |

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
| `GET` | `/dietary-preferences/recipe-count` | No | Get matching recipe count for a set of preferences |

**`PUT /users/me/dietary-preferences`**

Request:
```json
{ "restrictions": ["vegetarian", "gluten-free"], "soft_filter": false }
```

Response:
```json
{ "restrictions": ["vegetarian", "gluten-free"], "soft_filter": false, "matching_recipe_count": 12450, "updated_at": "2026-04-16T10:30:00Z" }
```

#### Simple Bookmarks

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/bookmarks` | Yes | Add a bookmark (to default "Saved" collection) |
| `DELETE` | `/bookmarks/:id` | Yes | Remove a bookmark |
| `GET` | `/bookmarks` | Yes | List user's bookmarks |

**`POST /bookmarks`**

Request:
```json
{ "recipe_id": "abc123" }
```

#### Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/notifications` | Yes | List user's notifications (paginated) |
| `POST` | `/notifications/:id/read` | Yes | Mark a notification as read |
| `POST` | `/notifications/read-all` | Yes | Mark all notifications as read |
| `GET` | `/notifications/unread-count` | Yes | Get count of unread notifications |

#### Modified Existing Endpoints

The existing `GET /recipes`, `GET /search`, and `GET /domains/:domain/recipes` endpoints are modified:

- For **authenticated users**: dietary preferences are looked up server-side (D1, cached in KV with 1hr TTL) and the bitmask filter is applied automatically.
- For **unauthenticated users**: accept an `X-Dietary-Prefs` header (comma-separated list of restriction IDs) as a hint. Compute the bitmask and apply the filter.
- When no preferences exist / header is absent, no filtering is applied (anonymous users see everything).

### 9.2 Phase 1b Endpoints

#### Collections

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/collections` | Yes | List user's collections |
| `POST` | `/collections` | Yes | Create a collection |
| `PATCH` | `/collections/:id` | Yes | Update collection name/visibility/position |
| `DELETE` | `/collections/:id` | Yes | Delete collection (moves bookmarks to "Saved") |
| `GET` | `/collections/:id/bookmarks` | Yes | List bookmarks in a collection |
| `POST` | `/bookmarks/move` | Yes | Move a bookmark to a different collection |
| `GET` | `/bookmarks/search` | Yes | Search within bookmarks/collections |

**`POST /bookmarks`** (updated in Phase 1b)

Request:
```json
{ "recipe_id": "abc123", "collection_id": "uuid-or-null" }
```

If `collection_id` is null, the bookmark goes to the default "Saved" collection.

#### Follows & Public Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users/:id/collections` | Optional | Get user's public collections |
| `GET` | `/users/:id/reviews` | Optional | Get user's reviews |
| `GET` | `/users/:id/followers` | Optional | Get user's followers |
| `GET` | `/users/:id/following` | Optional | Get user's following list |
| `POST` | `/users/:id/follow` | Yes | Follow a user |
| `DELETE` | `/users/:id/follow` | Yes | Unfollow a user |

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

### 9.3 Phase 2 Endpoints

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
| `POST` | `/shopping-lists/:id/share` | Yes | Generate share link (7-day expiry) |
| `POST` | `/shopping-lists/:id/share/renew` | Yes | Renew share link expiry |
| `DELETE` | `/shopping-lists/:id/share` | Yes | Revoke share link |
| `GET` | `/shared/lists/:token` | No | Access shared list (redirects to WebSocket for real-time) |
| `GET` | `/shopping-lists/:id/ws` | Yes/Share | WebSocket upgrade for real-time collaboration |
| `POST` | `/sync/shopping-list-items` | Yes | Batch sync offline shopping list mutations |

**`GET /shopping-lists/:id`**

Response (with rollup):
```json
{
  "id": "list-uuid",
  "name": "Shopping List",
  "is_default": true,
  "share_token": "share-uuid",
  "share_expires_at": "2026-04-23T10:00:00Z",
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
        "canonical_item": null,
        "display_text": "2 cups all-purpose flour",
        "total_quantity": null,
        "unit": null,
        "parsing": true,
        "sources": [
          { "item_id": "item-5", "recipe_id": "ghi", "original_text": "2 cups all-purpose flour", "parsing": true }
        ]
      }
    ],
    "checked": []
  },
  "updated_at": "2026-04-16T11:00:00Z"
}
```

### 9.4 Phase 3 Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/recipes/:id/reviews` | Yes | Submit a review (rating required, text optional) |
| `GET` | `/recipes/:id/reviews` | Optional | List reviews for a recipe |
| `PATCH` | `/reviews/:id` | Yes | Edit own review |
| `DELETE` | `/reviews/:id` | Yes | Delete own review |
| `POST` | `/reviews/:id/flag` | Yes | Flag a review |
| `GET` | `/recipes/:id/rating` | Optional | Get aggregate rating + user's own rating |
| `GET` | `/recipes/top-rated` | Optional | Get top-rated recipes |
| `GET` | `/admin/reviews/flagged` | Admin | List flagged reviews for moderation |
| `POST` | `/admin/reviews/:id/moderate` | Admin | Approve or remove a review |

**`POST /recipes/:id/reviews`**

Request (rating only):
```json
{ "rating": 4 }
```

Request (rating + review):
```json
{ "rating": 4, "text": "Great recipe! The sauce was perfect..." }
```

Response:
```json
{
  "id": "review-uuid",
  "user_rating": 4,
  "text": "Great recipe! The sauce was perfect...",
  "aggregate": { "average": 4.2, "count": 47 }
}
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

Returns recipes with `rating_count >= 5`, ordered by `avg_rating DESC, rating_count DESC`. Applies dietary filters if user is authenticated or `X-Dietary-Prefs` header is present.

### 9.5 Phase 4 Endpoints

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

## 10. Technical Architecture

### 10.1 Worker Topology (Updated)

```
                                    ┌─────────────┐
                                    │  CF Pages    │
                                    │  React SPA   │
                                    └──────┬───────┘
                                           │
                                    ┌──────▼───────┐      ┌────────────────┐
                                    │   rr-api     │      │  Workers AI    │
                                    │              │─────►│  @cf/meta/     │
                                    │  + Auth      │      │  llama-3.1-8b  │
                                    │  + User API  │      │  -instruct     │
                                    │  + Bookmarks │      └────────────────┘
                                    │  + Shopping  │
                                    │  + Ratings   │
                                    │  + Meal Plan │
                                    │  + Notifs    │
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
      │   truth)       │         │    auth state,  │
      └────────────────┘         │    caches)      │
               │                 └─────────────────┘
      ┌────────────────┐
      │  Queues        │
      │  - crawl-jobs  │
      │  - parse-jobs  │
      │  - projection  │
      │  - ingredient  │  ← ingredient parsing (Phase 2)
      │  - rating-sync │  ← async rating aggregate propagation (Phase 3)
      │  - recipe-del  │  ← recipe deletion fanout
      └────────────────┘
```

### 10.2 New Cloudflare Resources

| Resource | Type | Binding | Purpose |
|---|---|---|---|
| `reduced-recipes-users` | D1 | `USERS_DB` | All user data (profiles, bookmarks, ratings, reviews, shopping lists, meal plans, notifications, consent) |
| `rr-sessions` | KV | `SESSION_KV` | Session tokens (30-day TTL), auth state (10-min TTL), PKCE verifiers |
| `rr-user-cache` | KV | `USER_CACHE_KV` | Cached user-specific data (recommendations, dietary prefs, dietary feed pages) |
| `ShoppingListDO` | Durable Object | `SHOPPING_LIST_DO` | Real-time shopping list collaboration |
| `ingredient-parse-jobs` | Queue | `INGREDIENT_PARSE_QUEUE` | Async ingredient parsing |
| `rating-sync-jobs` | Queue | `RATING_SYNC_QUEUE` | Propagate rating aggregates to recipes DB + KV |
| `recipe-deletion-fanout` | Queue | `RECIPE_DELETION_QUEUE` | Clean up user data when a recipe is deleted |
| Workers AI | AI | `AI` | Dietary inference + ambiguous ingredient parsing |

### 10.3 Env Binding Updates

```typescript
// Additions to the Env interface in @rr/shared/types.ts
export interface Env {
  // ... existing bindings ...

  // Phase 1a
  USERS_DB: D1Database;
  SESSION_KV: KVNamespace;
  USER_CACHE_KV: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;
  SESSION_SECRET: string;  // for signing state params
  AI: Ai;  // Workers AI binding

  // Phase 2
  SHOPPING_LIST_DO: DurableObjectNamespace;
  INGREDIENT_PARSE_QUEUE: Queue;

  // Phase 3
  RATING_SYNC_QUEUE: Queue;

  // Cross-phase
  RECIPE_DELETION_QUEUE: Queue;
}
```

### 10.4 wrangler.api.toml Additions

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

# --- Workers AI ---
[ai]
binding = "AI"

# --- Durable Objects (Phase 2) ---
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

[[queues.producers]]
binding = "RECIPE_DELETION_QUEUE"
queue = "recipe-deletion-fanout"

[[queues.consumers]]
queue = "ingredient-parse-jobs"
max_batch_size = 10
max_retries = 3

[[queues.consumers]]
queue = "rating-sync-jobs"
max_batch_size = 10
max_retries = 3

[[queues.consumers]]
queue = "recipe-deletion-fanout"
max_batch_size = 10
max_retries = 3
```

### 10.5 Dietary Bitmask Computation

The dietary bitmask computation runs as part of the projection pipeline. When a recipe is projected into D1, the projection worker also computes the bitmask using the two-stage pipeline:

1. **Rule-based pre-pass:** Scan the ingredient list against a deterministic lookup table in `@rr/shared/data/dietary-rules.json`. Known non-compliant ingredients (e.g., `chicken` → clears vegetarian bit, `milk` → clears dairy-free bit) are applied immediately.

2. **Workers AI for ambiguous items:** Ingredients not covered by rules are batched and sent to `@cf/meta/llama-3.1-8b-instruct` with a structured prompt. The model returns dietary classifications that are merged with the rule-based results.

3. **Conservative approach:** Only set a bit to `1` if there is positive evidence. If uncertain, leave at `0` (recipe is excluded from that dietary feed). This is safer than false positives — users with restrictions should not see questionable recipes.

4. **Bitmask assembly:** OR together all applicable bit values to produce the final `dietary_bitmask` integer.

### 10.6 Recipe Deletion Fanout

When a recipe is deleted from the recipes database, a `RECIPE_DELETION_QUEUE` message triggers a fanout consumer that:

1. **Bookmarks:** Sets `recipe_deleted_at` on all bookmarks referencing the recipe. The client displays "Recipe no longer available" for these bookmarks.
2. **Rating aggregates:** Removes the `recipe_rating_aggregates` row for the recipe.
3. **Shopping list items:** Removes all `shopping_list_items` referencing the recipe.
4. **KV cache:** Purges any cached data referencing the recipe.

### 10.7 Weekly Reconciliation Cron

A mandatory scheduled Worker runs weekly to ensure cross-database consistency:

1. **Rating aggregates:** Recompute all `recipe_rating_aggregates` rows from source `reviews` table. Compare with current values and fix any drift.
2. **Orphaned bookmarks:** Check for bookmarks referencing recipes that no longer exist in the recipes DB. Mark them with `recipe_deleted_at`.
3. **Stale recipe views:** Delete views older than 90 days (data retention policy).
4. **Share token expiry:** Clean up expired share tokens (set `share_token = NULL, share_expires_at = NULL`).

```toml
# In wrangler.api.toml
[triggers]
crons = ["0 3 * * 0"]  # Every Sunday at 03:00 UTC
```

### 10.8 Mobile Offline Architecture

```
┌─────────────────────────────────────────────────────┐
│                 React Native (Expo)                  │
│                                                      │
│  ┌──────────────┐   ┌──────────────┐                │
│  │  TanStack     │   │  Zustand     │                │
│  │  Query        │   │  (auth state │                │
│  │  (server      │   │  + offline   │                │
│  │   cache)      │   │  queue)      │                │
│  └──────┬───────┘   └──────┬───────┘                │
│         │                   │                        │
│  ┌──────▼──────┐   ┌───────▼───────┐                │
│  │ Shared API  │   │useShoppingList│                │
│  │ Client      │   │Socket hook    │                │
│  │@rr/shared/  │   │(WebSocket     │                │
│  │api-client.ts│   │ state)        │                │
│  └──────┬──────┘   └───────┬───────┘                │
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

**Offline mutation queue** (stored in MMKV, managed by Zustand):

```typescript
interface OfflineMutation {
  id: string;            // UUID for dedup
  type: 'bookmark_add' | 'bookmark_remove' | 'rate' | 'check_item' | 'uncheck_item' | 'add_item' | 'remove_item';
  payload: Record<string, unknown>;
  timestamp: string;     // ISO 8601
  retries: number;
}
```

When the device regains connectivity (detected via `NetInfo`), the sync manager replays the queue in order, calling the appropriate batch sync endpoints.

---

## 11. Security Considerations

### 11.1 Authentication Security

| Threat | Mitigation |
|---|---|
| Session hijacking | Tokens are opaque UUIDs. Transmitted only over HTTPS. Stored in `httpOnly` + `Secure` + `SameSite=Strict` cookies (web) or SecureStore (mobile). |
| CSRF (web) | Web uses httpOnly cookies, so CSRF protection is needed. `SameSite=Strict` on cookies prevents cross-origin cookie sending. Additionally, **Origin header validation** is required on all state-changing requests — reject if Origin does not match allowed origins. |
| CSRF (mobile) | Mobile uses `Authorization: Bearer` header, which is not auto-attached by browsers. **No CSRF concern for mobile.** |
| Token leakage | Session tokens have a 30-day TTL. Refresh rotates the token with a 60-second grace period. Logout invalidates server-side. |
| OAuth code interception | **PKCE (RFC 7636)** on all OAuth flows. `code_verifier` stored server-side in KV, never exposed to client. |
| OAuth state tampering | The `state` parameter is an HMAC-signed nonce (signed with `SESSION_SECRET`). Verified on callback. |
| Google token exposure | Google access/refresh tokens are never stored. Only the `id_token` claims (sub, email, name, picture) are extracted during callback and discarded. |
| Auth endpoint abuse | Rate limiting: `/auth/google/url` 10/min per IP, `/auth/google/callback` 5/min per IP. |

### 11.2 CSRF Protection Detail

Because the API serves both web (cookie auth) and mobile (Bearer auth), CSRF protection is platform-specific:

- **Web:** Cookies are auto-sent by browsers, making state-changing requests vulnerable to CSRF. Mitigations:
  1. `SameSite=Strict` on the session cookie — prevents the browser from sending the cookie on cross-origin requests.
  2. **Origin header validation** — on all `POST`, `PUT`, `PATCH`, `DELETE` requests, the middleware checks that the `Origin` header matches the allowed origin list. If missing or mismatched, the request is rejected with 403.
  3. No additional CSRF tokens are needed because `SameSite=Strict` + Origin validation provides sufficient protection.

- **Mobile:** Bearer tokens are explicitly attached to each request by the app. Browsers do not auto-attach `Authorization` headers, so there is no CSRF vector.

### 11.3 Security Headers

The following headers are added to **all responses** via a Hono middleware:

```typescript
const securityHeaders: MiddlewareHandler = async (c, next) => {
  await next();
  c.header('Content-Security-Policy', "default-src 'self'; img-src 'self' https://lh3.googleusercontent.com; script-src 'self'");
  c.header('Strict-Transport-Security', 'max-age=63072000; includeSubDomains; preload');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
};
```

### 11.4 API Security

| Threat | Mitigation |
|---|---|
| Rate limiting | CF Rate Limiting rules at the edge. Additionally, per-user rate limits via KV counters for write endpoints (reviews, ratings, bookmark mutations). |
| SQL injection | All queries use parameterised bindings (D1 `.bind()`). No string interpolation in SQL. |
| XSS in reviews | Review text is sanitised server-side at write time (HTML tags stripped, special characters encoded). Stored text is safe to render without client-side escaping. |
| Overprivileged access | Users can only modify their own data. Every mutation endpoint verifies `c.get('userId') === resource.user_id`. |
| Shared list abuse | Share tokens are unguessable UUIDs (122 bits of entropy). Rate limiting on shared list writes. 7-day default expiry. Connection limit of 10 per list. |
| Review spam | Multi-layer prevention: server-verifiable interaction gate, blacklist, PII detection, rate limit, minimum account age, review bombing detection. |
| Admin endpoint access | Admin endpoints require `ADMIN_TOKEN` (same pattern as existing admin endpoints). Note: CF Access should be considered for admin auth in a future iteration. |
| CORS | Explicitly define allowed origins in the CORS middleware. **No wildcards.** Only `https://reducedrecipes.com` and the mobile app's origin (if applicable) are permitted. |

### 11.5 Data Isolation

- The recipes database and users database are completely separate D1 instances.
- There are no foreign key relationships between them.
- Recipe IDs in the users database are plain text references. The recipe-deletion-fanout queue consumer marks bookmarks with `recipe_deleted_at` when a recipe is deleted (see Section 10.6).
- This separation means a breach of the users DB does not expose recipe crawl infrastructure, and vice versa.

---

## 12. GDPR Compliance

### 12.1 Lawful Basis

- **Consent:** Users explicitly create an account via Google SSO. Consent is the lawful basis for processing personal data.
- **Legitimate interest:** Aggregate, anonymised rating data (after account deletion) serves a legitimate interest in product quality.
- **Special category data (Article 9):** Dietary preferences may constitute health data under GDPR Article 9. **Explicit consent** is required before collecting dietary preferences. The onboarding flow includes a consent step: "Your dietary preferences help us filter recipes. This data may be considered health-related information. Do you consent to us storing and processing this data?" Consent is recorded in the `consent_records` table with type `dietary_health_data`.

### 12.2 Consent Records

All consent grants and withdrawals are recorded with timestamps:

```json
{
  "consent_type": "dietary_health_data",
  "granted": true,
  "ip_address": "203.0.113.42",
  "user_agent": "Mozilla/5.0...",
  "created_at": "2026-04-16T10:00:00Z"
}
```

When a user withdraws consent for dietary health data, their dietary preferences are deleted and filtering reverts to the unfiltered experience.

### 12.3 Data Minimisation

- Only name, email, and profile picture URL are stored from Google — no contacts, calendar, or other scopes.
- No tracking cookies. No third-party analytics pixels. No ad networks.
- `recipe_views` stores only (user_id, recipe_id, timestamp) — no IP addresses, no device fingerprints.

### 12.4 Data Retention Policy

| Data | Retention | Mechanism |
|---|---|---|
| `recipe_views` | 90 days | Scheduled Worker deletes views older than 90 days (runs weekly, see Section 10.7) |
| Session tokens | 30 days | KV TTL auto-expiry |
| Auth state / PKCE verifiers | 10 minutes | KV TTL auto-expiry |
| All other user data | Until account deletion | Explicit user action |

### 12.5 Right to Access (Data Export)

**Endpoint:** `GET /users/me/export`

- Returns a JSON file containing all user data.
- Rate limited to 1 export per 24 hours.
- Response is `Content-Type: application/json` with `Content-Disposition: attachment; filename="reducedrecipes-data-export.json"`.

**Export JSON schema:**

```json
{
  "export_version": "1.0",
  "exported_at": "2026-04-16T12:00:00Z",
  "user": {
    "id": "uuid",
    "email": "jane@example.com",
    "name": "Jane Doe",
    "picture_url": "https://...",
    "profile_public": true,
    "tier": "free",
    "created_at": "2026-01-15T10:00:00Z"
  },
  "auth_providers": [
    { "provider": "google", "provider_email": "jane@gmail.com", "created_at": "..." }
  ],
  "consent_records": [
    { "consent_type": "privacy_policy", "granted": true, "created_at": "..." }
  ],
  "dietary_preferences": ["vegetarian", "gluten-free"],
  "collections": [
    { "id": "uuid", "name": "Saved", "is_default": true, "bookmarks": [
      { "recipe_id": "abc", "created_at": "..." }
    ]}
  ],
  "reviews": [
    { "recipe_id": "abc", "rating": 4, "text": "Great!", "created_at": "..." }
  ],
  "shopping_lists": [
    { "id": "uuid", "name": "Shopping List", "items": [...] }
  ],
  "meal_plans": [...],
  "recipe_views": [
    { "recipe_id": "abc", "viewed_at": "..." }
  ],
  "follows": {
    "following": ["user-uuid-1", "user-uuid-2"],
    "followers": ["user-uuid-3"]
  },
  "notifications": [...]
}
```

### 12.6 Right to Erasure (Account Deletion)

**Endpoint:** `DELETE /users/me`

- Requires re-authentication (user must provide their session token + confirm via a `confirm: true` body parameter).
- Deletion is processed asynchronously via a Queue job to handle cascading deletes without hitting Worker CPU limits.

**Deletion cascade:**

1. Delete all sessions: iterate `user-sessions:{user_id}` reverse index array, delete each `session:{token}` key, then delete the reverse index key.
2. Delete all rows from: `user_auth_providers`, `user_dietary_preferences`, `bookmarks`, `collections`, `reviews`, `review_flags`, `shopping_list_items`, `shopping_list_recipes`, `shopping_lists`, `meal_plan_entries`, `meal_plans`, `recipe_views`, `follows`, `notifications`, `consent_records`.
3. **Anonymise ratings:** Rating aggregates are NOT decremented (the aggregate is a property of the recipe, not the user). The individual `reviews` row is deleted but the `recipe_rating_aggregates` row remains with the contribution baked in. This is disclosed in the privacy policy.
4. Delete the `users` row.
5. Purge any KV caches: `recommendations:{user_id}`, `user-dietary:{user_id}`, `dietary-feed:*` entries referencing the user.

**Timeline:** Deletion completes within 72 hours (well within GDPR's "without undue delay" requirement). In practice it completes in seconds, but the 72-hour window accounts for Queue processing delays and cache expiry.

### 12.7 Privacy Policy Requirements

The privacy policy (served at `/privacy`) must disclose:

- What data is collected and why.
- That dietary preferences may constitute health data under GDPR Article 9 and require explicit consent.
- That data is stored on Cloudflare's infrastructure (EU and US data centres). Reference the [Cloudflare Data Processing Addendum (DPA)](https://www.cloudflare.com/cloudflare-customer-dpa/).
- How to request data export and account deletion.
- That anonymised rating aggregates survive account deletion.
- That shared shopping list links become inaccessible after account deletion.
- Data retention periods (recipe views: 90 days, sessions: 30 days).
- Contact email for privacy inquiries: `privacy@reducedrecipes.com`.

---

## 13. Performance Considerations

### 13.1 Dietary Filtering — The Critical Path

Dietary filtering is the highest-risk performance concern because it touches every recipe query for authenticated users. The design must ensure zero degradation compared to the anonymous experience.

**Approach: Bitmask column with single index**

Why this works:
- A **single INTEGER column** `dietary_bitmask` stores all 16 dietary flags in one value.
- A single index on `dietary_bitmask` supports any combination of dietary preferences.
- The query `WHERE (dietary_bitmask & :user_mask) = :user_mask` is a single index scan — no JOINs, no multiple partial indexes.
- Adding new dietary flags (up to 64 with a single INTEGER) requires no schema changes.
- D1's SQLite engine handles bitwise operations natively with negligible overhead.

**Benchmarking targets:**
- `GET /recipes` with dietary filter and cursor pagination: <50ms at p95.
- `GET /search` with dietary filter: <100ms at p95 (FTS + bitmask check).

**Fallback plan:** If D1 performance degrades with the bitmask scan, pre-compute dietary-specific recipe lists in KV. Cache key: `dietary-feed:{user_mask}:page:{n}`. Refresh every 15 minutes via a scheduled Worker. This trades freshness for speed.

### 13.2 Rating Aggregates — Async Propagation

When a user rates a recipe:
1. The `reviews` row is written synchronously to Users D1 (fast — single row upsert).
2. The `recipe_rating_aggregates` row is updated synchronously (same DB, same transaction).
3. A `RATING_SYNC_QUEUE` message is enqueued to propagate the aggregate to the Recipes D1 (`recipes.avg_rating`, `recipes.rating_count`) and to patch the KV recipe document.

This means the rating aggregate on recipe cards is eventually consistent (~1-5 second delay), but the user's own rating is immediately visible.

### 13.3 Shopping List Ingredient Parsing — Async

Ingredient parsing is CPU-intensive (regex + Workers AI). It runs asynchronously:
1. User adds a recipe to their shopping list → API immediately returns success with temporary items (`parsing: true`).
2. A Queue message triggers the ingredient parser.
3. Parsed items replace temporary items in D1.
4. Connected WebSocket clients receive a `parsing_complete` message. Non-connected clients see the updated state on next fetch.

Parsing a single recipe's ingredients (~10-20 items) should complete in <2 seconds including Workers AI inference.

### 13.4 Smart Rollup — Computed at Read Time

Rollup is not stored; it is computed when the shopping list is fetched. For a list with 50-100 items (typical), this is a lightweight in-memory groupBy + reduce operation — negligible latency.

If lists grow very large (500+ items), rollup can be cached in KV with a short TTL and invalidated on any mutation.

### 13.5 Durable Objects — Shopping List Collaboration

- Durable Objects are single-threaded and colocated with the first user who connects. If collaborators are geographically distant, one will experience higher latency.
- For the shopping list use case, this is acceptable — operations are simple (check/uncheck items) and latency tolerance is high (~200-500ms is fine).
- WebSocket Hibernation API ensures DOs are not billed when idle.
- **Batched D1 writes** (flush every 1-2 seconds) reduce write amplification during active editing. The DO's in-memory state is authoritative while active; D1 is the durable fallback.
- Maximum 10 concurrent WebSocket connections per list prevents abuse.

### 13.6 Caching Strategy Summary

| Data | Cache Layer | TTL | Invalidation |
|---|---|---|---|
| Recipe detail (KV) | RECIPES_KV | Indefinite | Updated on re-crawl |
| Recipe list pages | Edge cache (CF) | 1 hour | Purge on projection |
| Dietary-filtered feeds | USER_CACHE_KV | 15 min | Time-based expiry |
| User dietary preferences | USER_CACHE_KV | 1 hour | Invalidated on preference change |
| Session tokens | SESSION_KV | 30 days | Explicit delete on logout/rotation |
| Recommendations | USER_CACHE_KV | 24 hours | Recomputed daily |
| Rating aggregates | In recipe KV doc | Indefinite | Updated async via Queue |
| Shopping list state | Durable Object memory | While active | Flushed to D1 every 1-2s, persisted on hibernate |

---

## 14. Open Questions & Risks

### Open Questions

| # | Question | Impact | Proposed Resolution |
|---|---|---|---|
| 1 | **Dietary flag accuracy with Workers AI.** How accurate will the two-stage inference pipeline be across 60k recipes with varying ingredient formats? | Users may see non-compliant recipes or miss compliant ones. | Start conservative (only flag when confident). Add a "Report incorrect dietary info" button. Run accuracy benchmarks on a sample of 1000 recipes before full migration. Track accuracy metrics post-launch. |
| 2 | **D1 row limits.** D1 databases have a 10GB storage limit. Will user data fit? | At scale (100k+ users with heavy usage), could approach limits. | Monitor storage. User data is much smaller than recipe data. Shopping list items are the largest table — add a per-user item limit (1000 items across all lists). |
| 3 | **Durable Object cost.** DOs are billed per request + duration. How expensive is real-time collaboration? | Could be significant if many users keep WebSocket connections open. | WebSocket Hibernation API minimises duration billing. 10-connection limit per list. Batched D1 writes reduce request count. Monitor usage. |
| 4 | **Ingredient parsing quality.** Regex + Workers AI parsing will still fail on unusual formats ("a pinch of salt", "juice of 2 lemons"). | Poor parsing degrades shopping list usability. | Track `parse_failed` rate. If >15% of items fail, invest in more sophisticated prompting or a fine-tuned model. Users can always edit parsed items manually. |
| 5 | **FTS + dietary filtering.** Can we efficiently combine FTS5 search with bitmask filtering? | Search results may not respect dietary prefs, or may be slow. | Test with: `SELECT ... FROM recipes_fts JOIN recipes r WHERE recipes_fts MATCH ? AND (r.dietary_bitmask & :mask) = :mask`. If slow, filter post-FTS (fetch more results, filter in-app, paginate). |
| 6 | **Workers AI rate limits and latency.** The dietary inference migration runs across 60k recipes. Will Workers AI handle the batch volume? | Migration could take hours or hit rate limits. | Batch in groups of 100, use Queue with backoff. Estimate: ~6000 batches at 1-2 seconds each = ~2-3 hours. Run during low-traffic window. |
| 7 | **Notification delivery guarantees.** In-app notifications are fire-and-forget inserts. What if the user misses them? | Users may not see important notifications (e.g., flagged review outcomes). | Notifications persist in the DB. The bell icon shows unread count. No emails or push for now — revisit if engagement data warrants it. |

### Risks

| Risk | Severity | Likelihood | Mitigation |
|---|---|---|---|
| D1 performance under bitmask dietary filtering | High | Low | Bitmask is more efficient than JOINs. KV caching fallback. Benchmark before launch. |
| Google changes OAuth2 flow or deprecates endpoints | Medium | Low | Use standard OIDC + PKCE. Minimal dependency on Google-specific APIs. Multi-provider architecture supports quick migration. |
| Spam/abuse of reviews before moderation tools mature | Medium | Medium | Automated prevention (blacklist, PII detection, interaction gate, rate limit, review bombing detection) ships before reviews go live. |
| MMKV data loss on mobile (app uninstall, storage pressure) | Medium | Medium | Bookmarks are synced to server. Local data is a cache, not the source of truth. User is warned that uninstalling clears offline data. |
| Durable Object region placement causes latency for one collaborator | Low | High | Acceptable for shopping lists. Document the limitation. |
| Ingredient parser produces incorrect quantities (2x or 0.5x) | Medium | Medium | Show `original_text` alongside parsed display. Users can edit quantities manually. |
| Scope creep from Phase 4 AI features | High | High | Phase 4 is explicitly gated behind Phases 1-3 data accumulation. Do not start until sufficient user data exists. Spec will be refined closer to implementation. |
| Workers AI model changes or deprecation | Medium | Low | Wrap Workers AI calls in an abstraction layer. The dietary rules engine handles the majority of cases independently. Model changes only affect the ambiguous-ingredient path. |
| Cross-database drift between users and recipes DBs | Medium | Medium | Recipe-deletion-fanout queue handles real-time cleanup. Weekly reconciliation cron catches any drift. Both are mandatory deliverables. |

---

## Appendix A: Unit Normalisation Table

Used by the ingredient parser (Phase 2):

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

## Appendix C: Blacklisted Words & PII Detection — Review Spam Prevention

The blacklist is maintained as a JSON file in `@rr/shared/data/review-blacklist.json`. It is not included in this spec for brevity but should contain:

- Common profanity (~200 terms)
- Commercial spam: "buy", "discount", "coupon", "promo code", "click here", "visit my site"
- Gibberish detection: strings with >3 consecutive consonants or >50% non-alphabetic characters

**PII detection** runs as a separate pass using regex patterns:
- **Phone numbers:** `\b\d{3}[-.]?\d{3}[-.]?\d{4}\b`, plus international formats (`\+\d{1,3}[-.\s]?\d{4,14}`)
- **Email addresses:** Standard email regex pattern
- **Detection triggers review rejection** with a message: "Your review appears to contain personal contact information. Please remove it and try again."

The blacklist and PII detection are checked server-side only. They are never sent to the client.

## Appendix D: Recipe View Tracking

To support Phase 4 recommendations, start collecting recipe views in Phase 1a:

```typescript
// In the GET /recipes/:id handler, after optionalAuth middleware:
if (c.get('userId')) {
  // Fire-and-forget — do not await, do not block the response
  c.executionCtx.waitUntil(
    c.env.USERS_DB.prepare(
      'INSERT OR IGNORE INTO recipe_views (user_id, recipe_id, viewed_at) VALUES (?1, ?2, ?3)'
    ).bind(c.get('userId'), id, new Date().toISOString()).run()
  );
}
```

This adds no latency to the recipe detail endpoint. Views are deduplicated at write time via the UNIQUE constraint on `(user_id, recipe_id, date(viewed_at))` — one view per user per recipe per calendar day. The `INSERT OR IGNORE` ensures no errors on duplicates.

**Retention:** Views older than 90 days are automatically deleted by the weekly reconciliation cron (Section 10.7).
