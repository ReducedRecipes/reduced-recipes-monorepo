# Pantry Reverse Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users save a persistent pantry (ingredients on hand) and find recipes they can cook from it — exact matches or "almost there" — across web and mobile.

**Architecture:** The ingredient-search endpoint already returns per-recipe match/missing counts and sorts by fewest missing. We add a `max_missing` filter to it, introduce `/me/pantry` persistence endpoints backed by `USER_CACHE_KV`, lift shared types into `@rr/shared/pantry`, and add pantry UX on both surfaces (web reuses the existing `/ingredients` route; mobile gets a new tab). Guests persist locally (localStorage / MMKV); signed-in users round-trip through KV.

**Tech Stack:** Hono on Cloudflare Workers, D1 (recipes DB), KV (USER_CACHE_KV), React 19 + React Router v6 + TanStack Query, Expo Router + Zustand + react-native-mmkv, Vitest.

**Scope notes:**
- The existing `mode=exact|semantic` query param refers to keyword vs AI-expanded matching. We add a separate dimension: `max_missing` (an integer). Do not overload `mode`.
- We do **not** rename the existing `/api/v1/search/by-ingredients` endpoint or the `/ingredients` web route. Bookmarks and external links keep working.
- "Exact" pantry mode = `max_missing=0`. "Almost there" = `max_missing=3` (tuneable). Default request without `max_missing` keeps current behaviour (no upper bound) so the existing endpoint stays backwards compatible.

---

## File Structure

**Create:**
- `packages/shared/src/pantry.ts` — `PantryMatch`, `PantryRecipeResult`, `PantryState` types.
- `packages/workers/src/routes/pantry.ts` — `GET /api/v1/me/pantry`, `PUT /api/v1/me/pantry`.
- `packages/workers/src/routes/pantry.test.ts` — Vitest for the above.
- `packages/frontend/src/lib/pantry-storage.ts` — guest localStorage helpers + signed-in sync glue.
- `packages/frontend/src/hooks/usePantry.ts` — single source of truth hook for the pantry on web.
- `packages/mobile/src/stores/pantry.store.ts` — Zustand store, MMKV persist, KV sync side-effect.
- `packages/mobile/app/(tabs)/pantry.tsx` — new tab screen.
- `packages/mobile/src/components/PantryChipPicker.tsx` — chip picker with suggest dropdown.
- `packages/mobile/src/components/PantryResultCard.tsx` — result list row showing match %.

**Modify:**
- `packages/shared/package.json` — add `./pantry` export.
- `packages/workers/src/routes/ingredient-search.ts` — add `max_missing` param.
- `packages/workers/src/routes/ingredient-search.test.ts` — new cases for `max_missing`.
- `packages/workers/src/api.ts` — mount pantry router.
- `packages/frontend/src/lib/api.ts` — promote `IngredientSearchResult` to re-export from `@rr/shared/pantry`; add `getPantry`, `putPantry`, accept `max_missing` in `searchByIngredients`.
- `packages/frontend/src/pages/IngredientsPage.tsx` — mode tabs (`All` / `Exact` / `Almost there`), wire to `usePantry` instead of raw URL params.
- `packages/mobile/src/lib/api.ts` — add `searchByPantry`, `getPantry`, `putPantry`.
- `packages/mobile/app/(tabs)/_layout.tsx` — register pantry tab.

---

## Conventions to follow

From the existing codebase:

- Worker route file pattern: top-level `new Hono<AppBindings>()`, attach `requireAuth` middleware for user-scoped routes, return `c.json({ ... })` with explicit status and `Cache-Control` where applicable, error shape `{ error: { code, message } }`.
- Worker tests: factory `createEnv`, `createDB`, `createMockKV` (see `bookmarks.test.ts`). Hit routes via `router.request(url, init, env)`.
- Frontend pages: `useQuery` keyed by inputs; URL params via `useSearchParams`. Styling via CSS custom properties (`var(--bg)`, `var(--ink)`, etc.) and `.mono` / `.serif` / `.caps` classNames. No Tailwind chip utility — inline styles.
- Mobile screens: Expo Router tab file in `app/(tabs)/`; data via TanStack Query; persistent state via Zustand + `mmkvStorage` (see `preferences.store.ts`).

---

## Task 1: Shared types for pantry

**Files:**
- Create: `packages/shared/src/pantry.ts`
- Modify: `packages/shared/package.json:5-15`
- Test: `packages/shared/src/pantry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/shared/src/pantry.test.ts
import { describe, it, expect } from 'vitest';
import {
  emptyPantryState,
  isPantryState,
  type PantryState,
  type PantryRecipeResult,
} from './pantry';

describe('pantry types', () => {
  it('emptyPantryState returns have:[] exclude:[]', () => {
    expect(emptyPantryState()).toEqual({ have: [], exclude: [] });
  });

  it('isPantryState rejects null and bad shapes', () => {
    expect(isPantryState(null)).toBe(false);
    expect(isPantryState({ have: 'beef' })).toBe(false);
    expect(isPantryState({ have: ['beef'], exclude: [1] })).toBe(false);
  });

  it('isPantryState accepts valid shape', () => {
    const v: PantryState = { have: ['beef'], exclude: ['mushrooms'] };
    expect(isPantryState(v)).toBe(true);
  });

  it('PantryRecipeResult has expected match shape', () => {
    const r: PantryRecipeResult = {
      id: 'r1', title: 't', domain: 'd', image_url: null,
      total_time: null, cook_time: null, yields: null,
      cuisine: null, category: null,
      match: { have: 2, total: 3, missing: ['salt'] },
    };
    expect(r.match.missing).toEqual(['salt']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @rr/shared test pantry`
Expected: FAIL — file `./pantry` does not exist.

- [ ] **Step 3: Write the implementation**

```typescript
// packages/shared/src/pantry.ts
export interface PantryState {
  have: string[];
  exclude: string[];
}

export interface PantryMatch {
  have: number;
  total: number;
  missing: string[];
}

export interface PantryRecipeResult {
  id: string;
  title: string;
  domain: string;
  image_url: string | null;
  total_time: number | null;
  cook_time: number | null;
  yields: string | null;
  cuisine: string | null;
  category: string | null;
  match: PantryMatch;
}

export function emptyPantryState(): PantryState {
  return { have: [], exclude: [] };
}

export function isPantryState(v: unknown): v is PantryState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.have) && o.have.every((x) => typeof x === 'string') &&
    Array.isArray(o.exclude) && o.exclude.every((x) => typeof x === 'string')
  );
}
```

- [ ] **Step 4: Add export to package.json**

Edit `packages/shared/package.json` exports block, adding `"./pantry": "./src/pantry.ts"` next to the other entries:

```json
"exports": {
  ".": "./src/types.ts",
  "./extract": "./src/extract.ts",
  "./dietary": "./src/dietary.ts",
  "./env": "./src/env.ts",
  "./build-query": "./src/build-query.ts",
  "./pantry": "./src/pantry.ts"
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rr/shared test pantry`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/pantry.ts packages/shared/src/pantry.test.ts packages/shared/package.json
git commit -m "feat(shared): add pantry types and validators"
```

---

## Task 2: Add `max_missing` filter to ingredient search

**Files:**
- Modify: `packages/workers/src/routes/ingredient-search.ts:59-189`
- Test: `packages/workers/src/routes/ingredient-search.test.ts`

The endpoint currently returns all matches and sorts by fewest missing. We add an optional `max_missing` integer that drops results whose `missing.length` exceeds the threshold. `max_missing=0` gives strict "have everything"; `max_missing=3` gives "almost there".

- [ ] **Step 1: Write the failing test**

Append to `packages/workers/src/routes/ingredient-search.test.ts` (inside `describe('GET /api/v1/search/by-ingredients', ...)`):

```typescript
it('returns 400 for negative max_missing', async () => {
  const env = createEnv();
  const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&max_missing=-1', env);
  expect(res.status).toBe(400);
  const body = await res.json() as { error: { code: string } };
  expect(body.error.code).toBe('INVALID_INPUT');
});

it('filters out recipes whose missing count exceeds max_missing', async () => {
  // r1 has 3 ingredients (beef, potato, carrot) -> with have=beef, missing=2
  // r2 has 2 ingredients (chicken breast, carrot) -> with have=beef, missing=2 (no match -> not in matchRows)
  const env = createEnv({
    DB: createDB([
      { recipe_id: 'r1', match_count: 1 },
    ]) as unknown as D1Database,
  });
  const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&max_missing=1', env);
  expect(res.status).toBe(200);
  const body = await res.json() as { items: { id: string }[] };
  // r1 has 2 missing, which exceeds max_missing=1 -> filtered out
  expect(body.items).toEqual([]);
});

it('keeps recipes within max_missing threshold', async () => {
  const env = createEnv({
    DB: createDB([
      { recipe_id: 'r1', match_count: 1 },
    ]) as unknown as D1Database,
  });
  const res = await mockRequest('http://localhost/api/v1/search/by-ingredients?have=beef&max_missing=5', env);
  expect(res.status).toBe(200);
  const body = await res.json() as { items: { id: string }[] };
  expect(body.items.map((i) => i.id)).toEqual(['r1']);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rr/workers test ingredient-search`
Expected: FAIL — `max_missing` is currently ignored; the negative-value test gets 200 instead of 400; the filter test returns `r1` instead of `[]`.

- [ ] **Step 3: Add `max_missing` parsing + validation**

In `packages/workers/src/routes/ingredient-search.ts`, just after the `mode` parsing block (around line 64), add:

```typescript
const maxMissingRaw = c.req.query('max_missing');
let maxMissing: number | null = null;
if (maxMissingRaw !== undefined) {
  const parsed = parseInt(maxMissingRaw, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'max_missing must be a non-negative integer' } }, 400);
  }
  maxMissing = parsed;
}
```

- [ ] **Step 4: Apply the filter after `missing` is computed**

In the same file, replace the `items.sort(...)` line (around line 184) with:

```typescript
const filtered = maxMissing === null
  ? items
  : items.filter((i) => i.match.missing.length <= maxMissing);

filtered.sort((a, b) => a.match.missing.length - b.match.missing.length || b.match.have - a.match.have);

return c.json({ items: filtered, has_more: hasMore }, 200, {
  'Cache-Control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=300',
});
```

Delete the original trailing `items.sort(...)` and `return c.json({ items, has_more: hasMore }, ...)` block (lines 184-188).

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rr/workers test ingredient-search`
Expected: PASS — new and pre-existing tests all green.

- [ ] **Step 6: Commit**

```bash
git add packages/workers/src/routes/ingredient-search.ts packages/workers/src/routes/ingredient-search.test.ts
git commit -m "feat(api): add max_missing filter to ingredient search"
```

---

## Task 3: Pantry persistence endpoints

**Files:**
- Create: `packages/workers/src/routes/pantry.ts`
- Create: `packages/workers/src/routes/pantry.test.ts`
- Modify: `packages/workers/src/api.ts` (mount the router)

Endpoints:
- `GET /api/v1/me/pantry` → `{ pantry: PantryState }`, returns empty state when nothing stored.
- `PUT /api/v1/me/pantry` body `{ pantry: PantryState }` → `{ pantry: PantryState }` after normalisation.

Storage: `USER_CACHE_KV` key `pantry:{userId}`, JSON-encoded `PantryState`. No TTL — pantry should persist indefinitely.

Normalisation: lowercase + trim each entry, drop empties, dedupe (preserve first-seen order), cap at 100 entries each.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/workers/src/routes/pantry.test.ts
import { describe, it, expect, vi } from 'vitest';
import pantry from './pantry';
import type { Env } from '@rr/shared/env';

const TEST_USER = {
  id: 'user-1', email: 't@t', name: 'T', picture_url: null,
  profile_public: 1, tier: 'free' as const,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};

function makeUsersDB() {
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(TEST_USER),
    })),
  };
}

function makeKV(initial = new Map<string, string>()) {
  return {
    get: vi.fn(async (k: string) => initial.get(k) ?? null),
    put: vi.fn(async (k: string, v: string) => { initial.set(k, v); }),
    delete: vi.fn(),
    list: vi.fn(),
    getWithMetadata: vi.fn(),
  } as unknown as KVNamespace;
}

function createEnv(overrides: Partial<Record<string, unknown>> = {}) {
  const sessionStore = new Map([['session:tok', JSON.stringify({ user_id: 'user-1', expires_at: Date.now() + 1e9 })]]);
  return {
    DB: { prepare: vi.fn() },
    USERS_DB: makeUsersDB(),
    USER_CACHE_KV: makeKV(),
    SESSION_KV: makeKV(sessionStore),
    ...overrides,
  } as unknown as Env;
}

function authHeaders() {
  return { Authorization: 'Bearer tok' };
}

describe('GET /api/v1/me/pantry', () => {
  it('returns empty state when nothing stored', async () => {
    const env = createEnv();
    const res = await pantry.request('http://localhost/api/v1/me/pantry', { headers: authHeaders() }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pantry: { have: [], exclude: [] } });
  });

  it('returns stored pantry', async () => {
    const kv = makeKV(new Map([['pantry:user-1', JSON.stringify({ have: ['beef'], exclude: ['mushrooms'] })]]));
    const env = createEnv({ USER_CACHE_KV: kv });
    const res = await pantry.request('http://localhost/api/v1/me/pantry', { headers: authHeaders() }, env);
    expect(await res.json()).toEqual({ pantry: { have: ['beef'], exclude: ['mushrooms'] } });
  });

  it('returns 401 without auth', async () => {
    const env = createEnv();
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {}, env);
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/v1/me/pantry', () => {
  it('writes normalised pantry to KV', async () => {
    const kv = makeKV();
    const env = createEnv({ USER_CACHE_KV: kv });
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {
      method: 'PUT',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ pantry: { have: [' BEEF ', 'beef', 'potato', ''], exclude: ['Mushrooms'] } }),
    }, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pantry: { have: ['beef', 'potato'], exclude: ['mushrooms'] } });
    expect(kv.put).toHaveBeenCalledWith('pantry:user-1', JSON.stringify({ have: ['beef', 'potato'], exclude: ['mushrooms'] }));
  });

  it('returns 400 for invalid body', async () => {
    const env = createEnv();
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {
      method: 'PUT',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ pantry: { have: 'beef' } }),
    }, env);
    expect(res.status).toBe(400);
  });

  it('caps each list at 100 entries', async () => {
    const env = createEnv();
    const long = Array.from({ length: 150 }, (_, i) => `ing-${i}`);
    const res = await pantry.request('http://localhost/api/v1/me/pantry', {
      method: 'PUT',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ pantry: { have: long, exclude: [] } }),
    }, env);
    const body = await res.json() as { pantry: { have: string[] } };
    expect(body.pantry.have.length).toBe(100);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rr/workers test pantry`
Expected: FAIL — `./pantry` does not exist.

- [ ] **Step 3: Implement the router**

```typescript
// packages/workers/src/routes/pantry.ts
import { Hono } from 'hono';
import type { Env } from '@rr/shared/env';
import { isPantryState, emptyPantryState, type PantryState } from '@rr/shared/pantry';
import { requireAuth } from '../middleware/auth';

type AuthEnv = { Bindings: Env; Variables: { userId: string } };
const pantry = new Hono<AuthEnv>();

const PANTRY_LIMIT = 100;

function normalise(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const v = raw.trim().toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= PANTRY_LIMIT) break;
  }
  return out;
}

function kvKey(userId: string): string {
  return `pantry:${userId}`;
}

pantry.get('/api/v1/me/pantry', requireAuth, async (c) => {
  const userId = c.get('userId');
  const kv = c.env.USER_CACHE_KV;
  if (!kv) return c.json({ pantry: emptyPantryState() });

  const raw = await kv.get(kvKey(userId));
  if (!raw) return c.json({ pantry: emptyPantryState() });

  try {
    const parsed = JSON.parse(raw);
    if (isPantryState(parsed)) return c.json({ pantry: parsed });
  } catch {
    // fall through
  }
  return c.json({ pantry: emptyPantryState() });
});

pantry.put('/api/v1/me/pantry', requireAuth, async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<{ pantry?: unknown }>().catch(() => ({}));
  if (!isPantryState(body.pantry)) {
    return c.json({ error: { code: 'INVALID_INPUT', message: 'pantry must be { have: string[], exclude: string[] }' } }, 400);
  }

  const next: PantryState = {
    have: normalise(body.pantry.have),
    exclude: normalise(body.pantry.exclude),
  };

  const kv = c.env.USER_CACHE_KV;
  if (kv) await kv.put(kvKey(userId), JSON.stringify(next));

  return c.json({ pantry: next });
});

export default pantry;
```

- [ ] **Step 4: Mount the router in api.ts**

In `packages/workers/src/api.ts`, alongside other `app.route(...)` mounts (search the file for an existing `app.route('/', ...)` line and add a sibling):

```typescript
import pantry from './routes/pantry';
// ...
app.route('/', pantry);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rr/workers test pantry`
Expected: PASS — 6 tests.

Also run the full workers test suite to confirm no regressions: `pnpm --filter @rr/workers test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/workers/src/routes/pantry.ts packages/workers/src/routes/pantry.test.ts packages/workers/src/api.ts
git commit -m "feat(api): add /me/pantry persistence endpoints"
```

---

## Task 4: Web API client functions

**Files:**
- Modify: `packages/frontend/src/lib/api.ts:133-150`

Replace the locally-defined `IngredientSearchResult` with the shared `PantryRecipeResult`, add `max_missing` to `searchByIngredients`, and add `getPantry` / `putPantry`.

- [ ] **Step 1: Write the failing test**

`packages/frontend/src/lib/api.test.ts` (create if absent):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchByIngredients, getPantry, putPantry } from './api';

describe('pantry api client', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('searchByIngredients includes max_missing in query when set', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [], has_more: false }), { status: 200 }));
    await searchByIngredients(['beef'], [], 24, 0, 0);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/max_missing=0/);
  });

  it('searchByIngredients omits max_missing when undefined', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ items: [], has_more: false }), { status: 200 }));
    await searchByIngredients(['beef'], [], 24, 0);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toMatch(/max_missing/);
  });

  it('getPantry GETs /me/pantry', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ pantry: { have: ['beef'], exclude: [] } }), { status: 200 }));
    const res = await getPantry();
    expect(res).toEqual({ pantry: { have: ['beef'], exclude: [] } });
    expect((fetchMock.mock.calls[0][0] as string).endsWith('/me/pantry')).toBe(true);
  });

  it('putPantry PUTs JSON body', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ pantry: { have: ['beef'], exclude: [] } }), { status: 200 }));
    await putPantry({ have: ['beef'], exclude: [] });
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('PUT');
    expect(init.body).toBe(JSON.stringify({ pantry: { have: ['beef'], exclude: [] } }));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rr/frontend test api`
Expected: FAIL — `getPantry` / `putPantry` not exported; `max_missing` not supported.

- [ ] **Step 3: Update `packages/frontend/src/lib/api.ts`**

Replace the local `IngredientSearchResult` interface (around line 133) with a re-export from the shared package:

```typescript
import type { PantryRecipeResult, PantryState } from '@rr/shared/pantry';
export type { PantryRecipeResult, PantryState };
// Backwards-compatible alias for existing imports across the frontend:
export type IngredientSearchResult = PantryRecipeResult;
```

Update `searchByIngredients` signature and body (replace the existing function):

```typescript
export function searchByIngredients(
  have: string[],
  exclude: string[],
  limit = 24,
  offset = 0,
  maxMissing?: number,
): Promise<{ items: PantryRecipeResult[]; has_more: boolean }> {
  const params: Record<string, string | number> = { have: have.join(','), limit, offset };
  if (exclude.length > 0) params.exclude = exclude.join(',');
  if (maxMissing !== undefined) params.max_missing = maxMissing;
  return apiFetch(`/search/by-ingredients${buildQuery(params)}`);
}
```

Add the pantry persistence helpers next to it:

```typescript
export function getPantry(): Promise<{ pantry: PantryState }> {
  return apiFetch('/me/pantry');
}

export function putPantry(pantry: PantryState): Promise<{ pantry: PantryState }> {
  return apiFetch('/me/pantry', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pantry }),
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rr/frontend test api`
Expected: PASS — 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/lib/api.ts packages/frontend/src/lib/api.test.ts
git commit -m "feat(frontend): pantry API client and shared types"
```

---

## Task 5: Web `usePantry` hook + mode tabs

**Files:**
- Create: `packages/frontend/src/lib/pantry-storage.ts`
- Create: `packages/frontend/src/hooks/usePantry.ts`
- Modify: `packages/frontend/src/pages/IngredientsPage.tsx`

The hook is the single source of truth for the pantry on web. It hydrates from localStorage (guests) or `/me/pantry` (signed-in), pushes updates back to both, and also reflects the canonical state into the URL (for shareable links). Mode tabs (`All` / `Exact match` / `Almost there`) live in the page and drive `max_missing`.

Authentication on web is determined by the presence of `localStorage.session_token` (existing pattern at `packages/frontend/src/lib/api.ts:11`).

- [ ] **Step 1: Write the failing test**

`packages/frontend/src/lib/pantry-storage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { loadLocalPantry, saveLocalPantry } from './pantry-storage';

describe('pantry-storage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns empty state when nothing stored', () => {
    expect(loadLocalPantry()).toEqual({ have: [], exclude: [] });
  });

  it('round-trips a pantry through localStorage', () => {
    saveLocalPantry({ have: ['beef'], exclude: ['mushrooms'] });
    expect(loadLocalPantry()).toEqual({ have: ['beef'], exclude: ['mushrooms'] });
  });

  it('returns empty state on malformed json', () => {
    localStorage.setItem('rr_pantry', '{not json');
    expect(loadLocalPantry()).toEqual({ have: [], exclude: [] });
  });

  it('returns empty state on wrong shape', () => {
    localStorage.setItem('rr_pantry', JSON.stringify({ have: 'beef' }));
    expect(loadLocalPantry()).toEqual({ have: [], exclude: [] });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @rr/frontend test pantry-storage`
Expected: FAIL — `./pantry-storage` does not exist.

- [ ] **Step 3: Implement `pantry-storage.ts`**

```typescript
// packages/frontend/src/lib/pantry-storage.ts
import { emptyPantryState, isPantryState, type PantryState } from '@rr/shared/pantry';

const KEY = 'rr_pantry';

export function loadLocalPantry(): PantryState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyPantryState();
    const parsed = JSON.parse(raw);
    return isPantryState(parsed) ? parsed : emptyPantryState();
  } catch {
    return emptyPantryState();
  }
}

export function saveLocalPantry(state: PantryState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Quota or privacy-mode: silent
  }
}

export function isSignedIn(): boolean {
  try {
    return Boolean(localStorage.getItem('session_token'));
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @rr/frontend test pantry-storage`
Expected: PASS — 4 tests.

- [ ] **Step 5: Implement `usePantry` hook**

Create `packages/frontend/src/hooks/usePantry.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react';
import { emptyPantryState, type PantryState } from '@rr/shared/pantry';
import { loadLocalPantry, saveLocalPantry, isSignedIn } from '../lib/pantry-storage';
import { getPantry, putPantry } from '../lib/api';

export interface UsePantry {
  pantry: PantryState;
  setHave: (next: string[]) => void;
  setExclude: (next: string[]) => void;
  hydrated: boolean;
}

export function usePantry(): UsePantry {
  const [pantry, setPantry] = useState<PantryState>(emptyPantryState);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate once on mount: local first, then server (if signed in) overwrites.
  useEffect(() => {
    const local = loadLocalPantry();
    setPantry(local);
    setHydrated(true);

    if (isSignedIn()) {
      getPantry()
        .then((res) => {
          setPantry(res.pantry);
          saveLocalPantry(res.pantry);
        })
        .catch(() => {
          // Stay with local state on failure.
        });
    }
  }, []);

  const persist = useCallback((next: PantryState) => {
    setPantry(next);
    saveLocalPantry(next);
    if (isSignedIn()) {
      putPantry(next).catch(() => { /* best-effort */ });
    }
  }, []);

  const setHave = useCallback((next: string[]) => {
    persist({ have: next, exclude: pantry.exclude });
  }, [pantry.exclude, persist]);

  const setExclude = useCallback((next: string[]) => {
    persist({ have: pantry.have, exclude: next });
  }, [pantry.have, persist]);

  return { pantry, setHave, setExclude, hydrated };
}
```

- [ ] **Step 6: Wire `usePantry` and mode tabs into `IngredientsPage.tsx`**

Replace the existing URL-driven body of `IngredientsPage` (lines 76-167) with the hook + mode state. Key changes:

```typescript
import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { searchByIngredients } from '../lib/api';
import { usePantry } from '../hooks/usePantry';
import IngredientBoard from '../components/IngredientBoard';
import { Ticker } from '../components/design-system';
import type { PantryRecipeResult } from '@rr/shared/pantry';

type Mode = 'all' | 'exact' | 'almost';

function maxMissingFor(mode: Mode): number | undefined {
  if (mode === 'exact') return 0;
  if (mode === 'almost') return 3;
  return undefined;
}

// ResultCard stays as-is but accepts PantryRecipeResult.
function ResultCard({ recipe }: { recipe: PantryRecipeResult }) {
  // ... (preserve existing markup verbatim)
}

export default function IngredientsPage() {
  const { pantry, setHave, setExclude, hydrated } = usePantry();
  const [mode, setMode] = useState<Mode>('all');

  const maxMissing = useMemo(() => maxMissingFor(mode), [mode]);

  const { data, isLoading } = useQuery({
    queryKey: ['ingredient-search', pantry.have, pantry.exclude, maxMissing],
    queryFn: () => searchByIngredients(pantry.have, pantry.exclude, 48, 0, maxMissing),
    enabled: hydrated && pantry.have.length > 0,
  });

  const results = data?.items ?? [];

  return (
    <main style={{ minHeight: '80vh' }}>
      <section style={{ padding: '40px 0', borderBottom: '1px solid var(--rule)' }}>
        <div className="caps" style={{ color: 'var(--accent-ink)', marginBottom: 12 }}>◆ Your pantry</div>
        <h1 className="serif" style={{
          fontSize: 'clamp(36px, 5vw, 56px)', fontStyle: 'italic', lineHeight: 0.95,
          letterSpacing: '-0.02em', margin: '0 0 28px', fontWeight: 400,
        }}>
          Cook from your pantry
        </h1>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>
          <IngredientBoard
            title="Have"
            items={pantry.have}
            onAdd={(it) => setHave([...pantry.have, it])}
            onRemove={(it) => setHave(pantry.have.filter((x) => x !== it))}
          />
          <IngredientBoard
            title="Exclude"
            items={pantry.exclude}
            onAdd={(it) => setExclude([...pantry.exclude, it])}
            onRemove={(it) => setExclude(pantry.exclude.filter((x) => x !== it))}
            negative
          />
        </div>

        {pantry.have.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 24 }}>
            {(['all', 'exact', 'almost'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="mono"
                style={{
                  fontSize: 11, padding: '6px 12px', textTransform: 'uppercase',
                  background: m === mode ? 'var(--ink)' : 'transparent',
                  color: m === mode ? 'var(--bg)' : 'var(--ink)',
                  border: '1px solid var(--rule-2)', cursor: 'pointer',
                }}
              >
                {m === 'all' ? 'All' : m === 'exact' ? 'Exact match' : 'Almost there'}
              </button>
            ))}
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-2)' }}>
              <Ticker value={results.length} /> recipes
            </div>
          </div>
        )}
      </section>

      <section style={{ padding: '40px 0' }}>
        {!hydrated ? null : pantry.have.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', border: '1px dashed var(--rule-2)' }}>
            <div className="serif" style={{ fontSize: 28, fontStyle: 'italic', color: 'var(--ink-3)', marginBottom: 8 }}>
              Add ingredients to your pantry
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              Type an ingredient in the "Have" box above to find recipes you can cook.
            </div>
          </div>
        ) : isLoading ? (
          <div style={{ padding: '60px 40px', textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 12, color: 'var(--ink-3)' }}>Searching...</div>
          </div>
        ) : results.length === 0 ? (
          <div style={{ padding: '60px 40px', textAlign: 'center', border: '1px dashed var(--rule-2)' }}>
            <div className="serif" style={{ fontSize: 28, fontStyle: 'italic', color: 'var(--ink-3)', marginBottom: 8 }}>
              No recipes found
            </div>
            <div style={{ fontSize: 14, color: 'var(--ink-2)' }}>
              {mode === 'exact' ? 'Try "Almost there" or add more ingredients.' : 'Try different ingredients or relax your exclusions.'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 }}>
            {results.map((r) => <ResultCard key={r.id} recipe={r} />)}
          </div>
        )}
      </section>
    </main>
  );
}
```

When copying, preserve the existing `ResultCard` body verbatim from the current file — only its prop type changes from `IngredientSearchResult` to `PantryRecipeResult` (these are the same shape via the alias added in Task 4).

- [ ] **Step 7: Run the typecheck and existing frontend tests**

Run: `pnpm --filter @rr/frontend typecheck`
Expected: PASS.

Run: `pnpm --filter @rr/frontend test`
Expected: PASS — no regressions.

- [ ] **Step 8: Commit**

```bash
git add packages/frontend/src/lib/pantry-storage.ts packages/frontend/src/lib/pantry-storage.test.ts packages/frontend/src/hooks/usePantry.ts packages/frontend/src/pages/IngredientsPage.tsx
git commit -m "feat(frontend): persistent pantry with mode tabs"
```

---

## Task 6: Mobile pantry store

**Files:**
- Create: `packages/mobile/src/stores/pantry.store.ts`
- Modify: `packages/mobile/src/lib/api.ts`

Mobile uses Zustand with `mmkvStorage` for persistence (see `preferences.store.ts:1-43`). Signed-in detection mirrors the existing pattern (auth store / `Authorization` header). Reuse the auth store if it exposes a signed-in selector; otherwise check the bearer token presence.

- [ ] **Step 1: Add API client helpers**

Edit `packages/mobile/src/lib/api.ts`. Add at the bottom (preserve the existing `BASE_URL` and `apiFetch` setup):

```typescript
import type { PantryState, PantryRecipeResult } from '@rr/shared/pantry';

export function searchByPantry(
  have: string[],
  exclude: string[],
  limit = 24,
  offset = 0,
  maxMissing?: number,
): Promise<{ items: PantryRecipeResult[]; has_more: boolean }> {
  const params = new URLSearchParams({ have: have.join(','), limit: String(limit), offset: String(offset) });
  if (exclude.length > 0) params.set('exclude', exclude.join(','));
  if (maxMissing !== undefined) params.set('max_missing', String(maxMissing));
  return apiFetch(`/search/by-ingredients?${params.toString()}`);
}

export function getPantry(): Promise<{ pantry: PantryState }> {
  return apiFetch('/me/pantry');
}

export function putPantry(pantry: PantryState): Promise<{ pantry: PantryState }> {
  return apiFetch('/me/pantry', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pantry }),
  });
}
```

- [ ] **Step 2: Write the failing store test**

`packages/mobile/src/stores/pantry.store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { usePantryStore } from './pantry.store';

describe('usePantryStore', () => {
  beforeEach(() => {
    usePantryStore.setState({ have: [], exclude: [], hydrated: false });
  });

  it('starts empty', () => {
    expect(usePantryStore.getState().have).toEqual([]);
    expect(usePantryStore.getState().exclude).toEqual([]);
  });

  it('addHave dedupes and lowercases', () => {
    usePantryStore.getState().addHave('Beef');
    usePantryStore.getState().addHave('beef');
    expect(usePantryStore.getState().have).toEqual(['beef']);
  });

  it('removeHave drops the item', () => {
    usePantryStore.getState().addHave('beef');
    usePantryStore.getState().addHave('potato');
    usePantryStore.getState().removeHave('beef');
    expect(usePantryStore.getState().have).toEqual(['potato']);
  });

  it('replace sets both lists at once', () => {
    usePantryStore.getState().replace({ have: ['carrot'], exclude: ['onion'] });
    expect(usePantryStore.getState().have).toEqual(['carrot']);
    expect(usePantryStore.getState().exclude).toEqual(['onion']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @rr/mobile test pantry.store`
Expected: FAIL — store does not exist.

- [ ] **Step 4: Implement the store**

```typescript
// packages/mobile/src/stores/pantry.store.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '../lib/mmkv';
import { getPantry, putPantry } from '../lib/api';
import { emptyPantryState, type PantryState } from '@rr/shared/pantry';

interface PantryStore extends PantryState {
  hydrated: boolean;
  addHave: (item: string) => void;
  removeHave: (item: string) => void;
  addExclude: (item: string) => void;
  removeExclude: (item: string) => void;
  replace: (next: PantryState) => void;
  syncFromServer: () => Promise<void>;
}

function normaliseOne(raw: string): string {
  return raw.trim().toLowerCase();
}

function pushUnique(list: string[], v: string): string[] {
  const n = normaliseOne(v);
  if (!n || list.includes(n)) return list;
  return [...list, n];
}

async function pushToServer(state: PantryState): Promise<void> {
  try { await putPantry(state); } catch { /* best-effort */ }
}

export const usePantryStore = create<PantryStore>()(
  persist(
    (set, get) => ({
      ...emptyPantryState(),
      hydrated: false,
      addHave: (item) => {
        const next = { have: pushUnique(get().have, item), exclude: get().exclude };
        set(next);
        void pushToServer(next);
      },
      removeHave: (item) => {
        const n = normaliseOne(item);
        const next = { have: get().have.filter((x) => x !== n), exclude: get().exclude };
        set(next);
        void pushToServer(next);
      },
      addExclude: (item) => {
        const next = { have: get().have, exclude: pushUnique(get().exclude, item) };
        set(next);
        void pushToServer(next);
      },
      removeExclude: (item) => {
        const n = normaliseOne(item);
        const next = { have: get().have, exclude: get().exclude.filter((x) => x !== n) };
        set(next);
        void pushToServer(next);
      },
      replace: (next) => {
        set({ have: next.have, exclude: next.exclude });
        void pushToServer(next);
      },
      syncFromServer: async () => {
        try {
          const res = await getPantry();
          set({ have: res.pantry.have, exclude: res.pantry.exclude });
        } catch {
          // Stay with local state on failure.
        }
      },
    }),
    {
      name: 'pantry',
      storage: createJSONStorage(() => mmkvStorage),
      onRehydrateStorage: () => (state) => { state?.hydrated && (state.hydrated = true); },
      partialize: (state) => ({ have: state.have, exclude: state.exclude }),
    },
  ),
);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @rr/mobile test pantry.store`
Expected: PASS — 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/mobile/src/lib/api.ts packages/mobile/src/stores/pantry.store.ts packages/mobile/src/stores/pantry.store.test.ts
git commit -m "feat(mobile): pantry zustand store and API helpers"
```

---

## Task 7: Mobile Pantry tab UI

**Files:**
- Create: `packages/mobile/src/components/PantryChipPicker.tsx`
- Create: `packages/mobile/src/components/PantryResultCard.tsx`
- Create: `packages/mobile/app/(tabs)/pantry.tsx`
- Modify: `packages/mobile/app/(tabs)/_layout.tsx`

UX shape:
- Top: two horizontal chip rails ("Have" / "Exclude"), each with an inline text input and tap-to-add. Tap a chip to remove.
- Mode segmented control: `All` · `Exact` · `Almost`.
- Below: `FlatList` of `PantryResultCard` (image left, title + missing line + match badge right).
- On mount: call `usePantryStore.getState().syncFromServer()` if user is signed in.

Signed-in detection: import from the existing auth store (look for `useAuthStore` / `isSignedIn` selector in `packages/mobile/src/stores/`). If absent, check `SecureStore` for a session token (this is how `apiFetch` already attaches the Authorization header — reuse the same gate it uses).

- [ ] **Step 1: Implement `PantryChipPicker`**

```typescript
// packages/mobile/src/components/PantryChipPicker.tsx
import { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native';
import { colors, font } from '@/constants/theme';

interface Props {
  label: string;
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  negative?: boolean;
}

export function PantryChipPicker({ label, items, onAdd, onRemove, negative }: Props) {
  const [value, setValue] = useState('');
  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onAdd(v);
    setValue('');
  };
  return (
    <View style={s.box}>
      <Text style={s.label}>{label}</Text>
      <View style={s.chips}>
        {items.map((it) => (
          <Pressable key={it} onPress={() => onRemove(it)} style={[s.chip, negative && s.chipNeg]}>
            <Text style={[s.chipText, negative && s.chipTextNeg]}>{it} ×</Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={value}
        onChangeText={setValue}
        onSubmitEditing={submit}
        returnKeyType="done"
        placeholder={negative ? 'Add to avoid…' : 'Add ingredient…'}
        placeholderTextColor={colors.ink2}
        style={s.input}
      />
    </View>
  );
}

const s = StyleSheet.create({
  box: { paddingVertical: 12 },
  label: { fontFamily: font.mono, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: colors.accent, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  chip: { backgroundColor: colors.ink, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  chipNeg: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.rule },
  chipText: { color: colors.bg, fontFamily: font.mono, fontSize: 12 },
  chipTextNeg: { color: colors.ink },
  input: { borderBottomWidth: 1, borderBottomColor: colors.rule, paddingVertical: 8, fontFamily: font.serif, fontSize: 16, color: colors.ink },
});
```

- [ ] **Step 2: Implement `PantryResultCard`**

```typescript
// packages/mobile/src/components/PantryResultCard.tsx
import { Link } from 'expo-router';
import { View, Text, Image, StyleSheet } from 'react-native';
import { colors, font } from '@/constants/theme';
import type { PantryRecipeResult } from '@rr/shared/pantry';

export function PantryResultCard({ recipe }: { recipe: PantryRecipeResult }) {
  const pct = recipe.match.total > 0 ? Math.round((recipe.match.have / recipe.match.total) * 100) : 0;
  return (
    <Link href={`/recipe/${recipe.id}`} asChild>
      <View style={s.row}>
        {recipe.image_url ? (
          <Image source={{ uri: recipe.image_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbFallback]} />
        )}
        <View style={s.body}>
          <Text style={s.title} numberOfLines={2}>{recipe.title}</Text>
          {recipe.match.missing.length > 0 && (
            <Text style={s.missing} numberOfLines={1}>
              Need: {recipe.match.missing.slice(0, 3).join(', ')}
              {recipe.match.missing.length > 3 ? ` +${recipe.match.missing.length - 3}` : ''}
            </Text>
          )}
          <Text style={s.meta}>{recipe.domain} · {pct}% match</Text>
        </View>
      </View>
    </Link>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.rule },
  thumb: { width: 88, height: 72 },
  thumbFallback: { backgroundColor: colors.accentLight },
  body: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: font.serif, fontSize: 18, color: colors.ink, lineHeight: 22 },
  missing: { fontFamily: font.mono, fontSize: 11, color: colors.accent, marginTop: 2 },
  meta: { fontFamily: font.mono, fontSize: 10, color: colors.ink2, marginTop: 4, textTransform: 'uppercase' },
});
```

- [ ] **Step 3: Implement the `pantry` tab screen**

```typescript
// packages/mobile/app/(tabs)/pantry.tsx
import { useEffect, useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { colors, font } from '@/constants/theme';
import { usePantryStore } from '@/stores/pantry.store';
import { searchByPantry } from '@/lib/api';
import { PantryChipPicker } from '@/components/PantryChipPicker';
import { PantryResultCard } from '@/components/PantryResultCard';

type Mode = 'all' | 'exact' | 'almost';

const MODE_LIMITS: Record<Mode, number | undefined> = { all: undefined, exact: 0, almost: 3 };

export default function PantryScreen() {
  const have = usePantryStore((s) => s.have);
  const exclude = usePantryStore((s) => s.exclude);
  const addHave = usePantryStore((s) => s.addHave);
  const removeHave = usePantryStore((s) => s.removeHave);
  const addExclude = usePantryStore((s) => s.addExclude);
  const removeExclude = usePantryStore((s) => s.removeExclude);
  const syncFromServer = usePantryStore((s) => s.syncFromServer);

  const [mode, setMode] = useState<Mode>('all');
  const maxMissing = useMemo(() => MODE_LIMITS[mode], [mode]);

  useEffect(() => {
    void syncFromServer();
  }, [syncFromServer]);

  const { data, isLoading } = useQuery({
    queryKey: ['pantry-search', have, exclude, maxMissing],
    queryFn: () => searchByPantry(have, exclude, 30, 0, maxMissing),
    enabled: have.length > 0,
  });

  const recipes = data?.items ?? [];

  return (
    <View style={s.container}>
      <ScrollView contentContainerStyle={s.scroll}>
        <Text style={s.h1}>Cook from your pantry</Text>

        <PantryChipPicker label="Have" items={have} onAdd={addHave} onRemove={removeHave} />
        <PantryChipPicker label="Exclude" items={exclude} onAdd={addExclude} onRemove={removeExclude} negative />

        {have.length > 0 && (
          <View style={s.modeRow}>
            {(['all', 'exact', 'almost'] as const).map((m) => (
              <Pressable
                key={m}
                onPress={() => setMode(m)}
                style={[s.modeChip, m === mode && s.modeChipActive]}
              >
                <Text style={[s.modeText, m === mode && s.modeTextActive]}>
                  {m === 'all' ? 'All' : m === 'exact' ? 'Exact' : 'Almost'}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {have.length === 0 ? (
          <Text style={s.empty}>Add ingredients above to find recipes you can cook.</Text>
        ) : isLoading ? (
          <Text style={s.loading}>Searching…</Text>
        ) : recipes.length === 0 ? (
          <Text style={s.empty}>
            No recipes found. {mode === 'exact' ? 'Try "Almost" or add more ingredients.' : 'Try different ingredients.'}
          </Text>
        ) : (
          <FlatList
            data={recipes}
            keyExtractor={(r) => r.id}
            renderItem={({ item }) => <PantryResultCard recipe={item} />}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40 },
  h1: { fontFamily: font.serif, fontSize: 32, color: colors.ink, marginBottom: 16, fontStyle: 'italic' },
  modeRow: { flexDirection: 'row', gap: 8, marginVertical: 12 },
  modeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: colors.rule },
  modeChipActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  modeText: { fontFamily: font.mono, fontSize: 11, textTransform: 'uppercase', color: colors.ink },
  modeTextActive: { color: colors.bg },
  empty: { fontFamily: font.serif, fontSize: 16, color: colors.ink2, paddingVertical: 40, textAlign: 'center' },
  loading: { fontFamily: font.mono, fontSize: 12, color: colors.ink2, paddingVertical: 40, textAlign: 'center' },
});
```

- [ ] **Step 4: Register the tab**

In `packages/mobile/app/(tabs)/_layout.tsx`, add a `<Tabs.Screen>` for `pantry` next to the existing ones. Place it between `search` and `saved` so the order reads Index → Search → Pantry → Saved → List → Settings:

```typescript
<Tabs.Screen
  name="pantry"
  options={{
    title: 'Pantry',
    tabBarIcon: ({ color, size }) => (
      // Reuse an existing icon import style; the existing layout file uses lucide-react-native or similar.
      // Pick an icon already imported nearby; if none fits, import `Refrigerator` from the icon library already in use.
      <RefrigeratorIcon color={color} size={size} />
    ),
  }}
/>
```

Adjust the icon import to match whatever icon library is already used in `_layout.tsx`.

- [ ] **Step 5: Typecheck + run mobile tests**

Run: `pnpm --filter @rr/mobile typecheck`
Expected: PASS.

Run: `pnpm --filter @rr/mobile test`
Expected: PASS — no regressions; new tests from Task 6 included.

- [ ] **Step 6: Commit**

```bash
git add packages/mobile/src/components/PantryChipPicker.tsx packages/mobile/src/components/PantryResultCard.tsx packages/mobile/app/\(tabs\)/pantry.tsx packages/mobile/app/\(tabs\)/_layout.tsx
git commit -m "feat(mobile): pantry tab with chip picker and mode toggle"
```

---

## Task 8: Final integration check + manual verification

**Files:** No code changes; verification only.

- [ ] **Step 1: Full monorepo build + typecheck + tests**

Run, in order:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: each completes with no errors.

- [ ] **Step 2: Local end-to-end verification (web)**

Run: `pnpm dev`

Open the dev URL printed to the terminal. Navigate to `/ingredients`. Perform:

1. Without signing in: add `beef` to Have. Reload the page. Expected: `beef` still present.
2. Sign in. The page should refresh and the pantry (still `beef`) should now also persist server-side. Sign out and sign back in on a different browser profile — expected: `beef` reappears.
3. Toggle `Exact match`. Expected: results shown all have `missing.length === 0` (the per-card "Need: …" line never appears).
4. Toggle `Almost there`. Expected: results all have ≤ 3 missing ingredients.

If any assertion fails, stop and surface the deviation.

- [ ] **Step 3: Local end-to-end verification (mobile)**

Run: `pnpm mobile` (Expo dev server), open in iOS simulator or device.

Perform:

1. Open the new Pantry tab.
2. Add `beef`, `potato`. Force-quit the app and reopen. Expected: items persist.
3. Sign in. Background the app for 30s, foreground. Expected: pantry still intact (no clobber from server sync).
4. On the same signed-in account on web, add `carrot`. Re-open the mobile Pantry tab. Expected: `carrot` appears (server sync on screen mount).
5. Toggle through `All` / `Exact` / `Almost`. Expected: result list updates each time.

- [ ] **Step 4: Final commit (if any housekeeping changes were needed during verification)**

If verification surfaced minor fixes (e.g., icon swap, copy tweak), commit them now with conventional commit messages. Otherwise skip.

```bash
git status   # confirm clean
```

- [ ] **Step 5: Open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat: pantry reverse search across web and mobile" --body "$(cat <<'EOF'
## Summary
- Persistent pantry on web (localStorage + KV sync) and mobile (MMKV + KV sync)
- Mode tabs: All / Exact match / Almost there, backed by new max_missing filter on /search/by-ingredients
- New /me/pantry GET/PUT endpoints backed by USER_CACHE_KV
- Shared PantryState and PantryRecipeResult types in @rr/shared/pantry
- New Pantry tab on mobile mirrors the web experience

## Test plan
- [x] Vitest passes across shared/workers/frontend/mobile
- [ ] Manual web flow: guest persist, sign-in merge, mode tabs
- [ ] Manual mobile flow: persist across relaunch, server sync on mount, mode toggle
EOF
)"
```

---

## Self-review

**Spec coverage:**
- Persistent pantry across web + mobile → Tasks 5, 6, 7
- Guest persistence (localStorage / MMKV) → Tasks 5, 6
- Signed-in sync via USER_CACHE_KV → Tasks 3, 5, 6
- Exact / almost / all match modes → Task 2 (`max_missing`), Tasks 5 and 7 (UI)
- Mobile tab + chip picker + results → Task 7
- Shared types → Task 1

**Placeholder scan:** No TBDs; every code step is complete code. The mobile icon import in Task 7 step 4 is the only soft spot — explicitly note "match whatever icon library is already in use" so the implementer doesn't fabricate a new dependency.

**Type consistency:** `PantryState`, `PantryRecipeResult`, `PantryMatch` are defined once in Task 1 and reused by name in Tasks 2-7. Endpoint shapes match across worker (Task 3) and clients (Tasks 4, 6). KV key `pantry:{userId}` is consistent.

**Known risk:** The auth-store import on mobile (used to detect signed-in for sync) is referenced indirectly via `getPantry()` / `putPantry()`'s reliance on `apiFetch` attaching the bearer token. If `apiFetch` silently calls `/me/pantry` without auth, the endpoint returns 401 and we swallow the error — which is the desired behaviour, so no auth-gating is required on the client. Confirm during Task 7 step 3 that this is true; if `apiFetch` throws on 401 in a way that breaks UI, wrap the call site accordingly.
