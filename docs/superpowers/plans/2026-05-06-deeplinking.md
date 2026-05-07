# Deeplinking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `https://reduced.recipes/recipe/:id` and `https://reduced.recipes/shared/lists/:token` open the ReducedRecipes mobile app when installed, with silent fallback to the web page when not installed.

**Architecture:** Add two `/.well-known/` JSON endpoints to the `rr-api` Cloudflare Worker (AASA + assetlinks.json). Switch the mobile app's iOS associated domains, Android intent filters, and Expo Router origin from `reducedrecipes.com` to `reduced.recipes`. Rename the mobile shared-list route file to align with the public web URL path. Update the in-app share message to use the new domain. No changes to the legacy `EXPO_PUBLIC_API_BASE` (still points at `reducedrecipes.com` for the API).

**Tech Stack:** Cloudflare Workers (Hono), Expo SDK 54, Expo Router v6, Vitest. Apple Universal Links + Android App Links.

**Spec:** `docs/superpowers/specs/2026-05-06-deeplinking-design.md`

---

## File map

**Create:**
- (none — both well-known handlers are added inside existing `api.ts`)

**Modify:**
- `packages/workers/src/api.ts` — add two GET handlers and read two new env values
- `packages/workers/src/api.test.ts` — add tests for both handlers
- `packages/mobile/app.json` — switch host to `reduced.recipes`, add `/shared/lists/` Android prefix
- `packages/mobile/app/recipe/[id].tsx` — share-message URL host
- `packages/mobile/src/__tests__/config.test.ts` — assertions about associatedDomains and intentFilters
- `packages/mobile/src/__tests__/recipe-detail.test.ts` — share-URL assertion
- `packages/shared/src/env.ts` — add the two new optional env fields (if a typed `Env` exists; otherwise skip)

**Wrangler config:** No `wrangler.api.toml` edits needed. Worker secrets are set via `wrangler secret put` at deploy time (see the deploy runbook in Task 11) and are automatically available on the `Env` binding without being declared in the toml.

**Move:**
- `packages/mobile/app/shared-list/[token].tsx` → `packages/mobile/app/shared/lists/[token].tsx`

**No changes:**
- `eas.json` — `EXPO_PUBLIC_API_BASE` stays at `reducedrecipes.com` (out of scope per spec)
- `src/lib/api.ts` and other API-base callers — same reason

---

## Task 1: Add AASA and assetlinks env types

Wire the two new env values into the typed `Env` so the Worker handler can read them safely.

**Files:**
- Modify: `packages/shared/src/env.ts`

- [ ] **Step 1: Locate the Env type**

Run: `grep -n "interface Env\|type Env" /Users/jannik/development/ReducedRecipes/reduced-recipes-monorepo/packages/shared/src/env.ts`

Note the line number where `Env` is declared. If `env.ts` doesn't exist or doesn't declare `Env`, search the workspace:
`grep -rn "interface Env" /Users/jannik/development/ReducedRecipes/reduced-recipes-monorepo/packages/shared/src /Users/jannik/development/ReducedRecipes/reduced-recipes-monorepo/packages/workers/src`

- [ ] **Step 2: Add two optional string fields to Env**

Inside the `Env` interface (alongside other secrets like `ADMIN_TOKEN`), add:

```ts
  /** Apple Developer Team ID, used in AASA. Set via `wrangler secret put APPLE_TEAM_ID`. */
  APPLE_TEAM_ID?: string;
  /** Android Play app-signing SHA256 cert fingerprint, used in assetlinks.json. Set via `wrangler secret put ANDROID_CERT_SHA256`. */
  ANDROID_CERT_SHA256?: string;
```

They are optional because preview/dev environments may not have them set; the handlers below treat missing values as 503.

- [ ] **Step 3: Typecheck**

Run from repo root: `pnpm typecheck`
Expected: passes (no new errors).

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/env.ts
git commit -m "feat(shared): add APPLE_TEAM_ID and ANDROID_CERT_SHA256 env fields"
```

---

## Task 2: Add failing test for AASA handler

**Files:**
- Modify: `packages/workers/src/api.test.ts`

- [ ] **Step 1: Add the test**

Append a new `describe` block at the end of `packages/workers/src/api.test.ts` (after the last existing `describe`):

```ts
describe('GET /.well-known/apple-app-site-association', () => {
  it('returns the AASA JSON with correct content-type and no redirect', async () => {
    const env = createEnv({ APPLE_TEAM_ID: 'TESTTEAMID' });
    const res = await req('/.well-known/apple-app-site-association', env);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

    const body = await res.json();
    expect(body.applinks.apps).toEqual([]);
    expect(body.applinks.details).toHaveLength(1);
    expect(body.applinks.details[0].appID).toBe('TESTTEAMID.com.reducedrecipes.app');
    expect(body.applinks.details[0].paths).toEqual([
      'NOT /recipe/',
      'NOT /shared/lists/',
      '/recipe/*',
      '/shared/lists/*',
    ]);
  });

  it('returns 503 when APPLE_TEAM_ID is not configured', async () => {
    const env = createEnv();
    const res = await req('/.well-known/apple-app-site-association', env);
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- packages/workers/src/api.test.ts -t "apple-app-site-association"`
Expected: FAIL with 404 (or similar) because the handler does not exist yet.

- [ ] **Step 3: Commit (red test)**

```bash
git add packages/workers/src/api.test.ts
git commit -m "test(workers): add failing AASA handler tests"
```

---

## Task 3: Implement AASA handler

**Files:**
- Modify: `packages/workers/src/api.ts`

- [ ] **Step 1: Add the handler**

Find the `app.get('/robots.txt', ...)` block (around line 744). Immediately after the closing `});` of that handler, add:

```ts
// ── Universal Links / App Links verification files ──────────────────────
app.get('/.well-known/apple-app-site-association', (c) => {
  const teamId = c.env.APPLE_TEAM_ID;
  if (!teamId) {
    return c.json({ error: 'AASA not configured' }, 503);
  }
  return c.json(
    {
      applinks: {
        apps: [],
        details: [
          {
            appID: `${teamId}.com.reducedrecipes.app`,
            paths: [
              'NOT /recipe/',
              'NOT /shared/lists/',
              '/recipe/*',
              '/shared/lists/*',
            ],
          },
        ],
      },
    },
    200,
    { 'Cache-Control': 'public, max-age=3600' },
  );
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm test -- packages/workers/src/api.test.ts -t "apple-app-site-association"`
Expected: both tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/workers/src/api.ts
git commit -m "feat(workers): serve apple-app-site-association from rr-api"
```

---

## Task 4: Add failing test for assetlinks handler

**Files:**
- Modify: `packages/workers/src/api.test.ts`

- [ ] **Step 1: Add the test**

Append after the AASA describe block:

```ts
describe('GET /.well-known/assetlinks.json', () => {
  it('returns assetlinks JSON for the Android app', async () => {
    const env = createEnv({
      ANDROID_CERT_SHA256: 'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    });
    const res = await req('/.well-known/assetlinks.json', env);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/application\/json/);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');

    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].relation).toEqual(['delegate_permission/common.handle_urls']);
    expect(body[0].target.namespace).toBe('android_app');
    expect(body[0].target.package_name).toBe('com.reducedrecipes.app');
    expect(body[0].target.sha256_cert_fingerprints).toEqual([
      'AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99',
    ]);
  });

  it('returns 503 when ANDROID_CERT_SHA256 is not configured', async () => {
    const env = createEnv();
    const res = await req('/.well-known/assetlinks.json', env);
    expect(res.status).toBe(503);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test -- packages/workers/src/api.test.ts -t "assetlinks"`
Expected: FAIL (404).

- [ ] **Step 3: Commit (red test)**

```bash
git add packages/workers/src/api.test.ts
git commit -m "test(workers): add failing assetlinks.json handler tests"
```

---

## Task 5: Implement assetlinks.json handler

**Files:**
- Modify: `packages/workers/src/api.ts`

- [ ] **Step 1: Add the handler**

Immediately after the AASA handler added in Task 3, add:

```ts
app.get('/.well-known/assetlinks.json', (c) => {
  const sha256 = c.env.ANDROID_CERT_SHA256;
  if (!sha256) {
    return c.json({ error: 'assetlinks not configured' }, 503);
  }
  return c.json(
    [
      {
        relation: ['delegate_permission/common.handle_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'com.reducedrecipes.app',
          sha256_cert_fingerprints: [sha256],
        },
      },
    ],
    200,
    { 'Cache-Control': 'public, max-age=3600' },
  );
});
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `pnpm test -- packages/workers/src/api.test.ts -t "assetlinks"`
Expected: both tests PASS.

- [ ] **Step 3: Run the full workers test suite as a regression sanity-check**

Run: `pnpm test -- packages/workers/src/api.test.ts`
Expected: all tests pass, including the four new ones.

- [ ] **Step 4: Commit**

```bash
git add packages/workers/src/api.ts
git commit -m "feat(workers): serve .well-known/assetlinks.json from rr-api"
```

---

## Task 6: Update mobile app.json for Universal Links / App Links

**Files:**
- Modify: `packages/mobile/app.json`

- [ ] **Step 1: Replace the iOS associatedDomains array**

In `packages/mobile/app.json`, find the `ios.associatedDomains` array:

```json
"associatedDomains": [
  "applinks:reducedrecipes.com",
  "webcredentials:reducedrecipes.com"
]
```

Replace with:

```json
"associatedDomains": [
  "applinks:reduced.recipes",
  "webcredentials:reduced.recipes"
]
```

- [ ] **Step 2: Replace the Android intentFilters array**

Find the `android.intentFilters` array. Replace the entire array with:

```json
"intentFilters": [
  {
    "action": "VIEW",
    "autoVerify": true,
    "data": [
      { "scheme": "https", "host": "reduced.recipes", "pathPrefix": "/recipe/" },
      { "scheme": "https", "host": "reduced.recipes", "pathPrefix": "/shared/lists/" }
    ],
    "category": [
      "BROWSABLE",
      "DEFAULT"
    ]
  }
]
```

- [ ] **Step 3: Update Expo Router origin**

Find:

```json
"router": {
  "origin": "https://reducedrecipes.com"
}
```

Replace with:

```json
"router": {
  "origin": "https://reduced.recipes"
}
```

- [ ] **Step 4: Verify the JSON parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('packages/mobile/app.json','utf8')); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add packages/mobile/app.json
git commit -m "feat(mobile): switch deeplink domain to reduced.recipes; add /shared/lists/ App Link prefix"
```

---

## Task 7: Update mobile config tests

**Files:**
- Modify: `packages/mobile/src/__tests__/config.test.ts`

- [ ] **Step 1: Replace the iOS associatedDomains assertion**

In `config.test.ts` find:

```ts
it('has iOS config with bundleIdentifier and associatedDomains', () => {
  expect(expo.ios.bundleIdentifier).toBe('com.reducedrecipes.app');
  expect(expo.ios.associatedDomains).toContain('applinks:reducedrecipes.com');
});
```

Replace with:

```ts
it('has iOS config with bundleIdentifier and associatedDomains', () => {
  expect(expo.ios.bundleIdentifier).toBe('com.reducedrecipes.app');
  expect(expo.ios.associatedDomains).toContain('applinks:reduced.recipes');
  expect(expo.ios.associatedDomains).toContain('webcredentials:reduced.recipes');
});
```

- [ ] **Step 2: Replace the Android intentFilters assertion**

Find:

```ts
it('has Android config with package and intentFilters', () => {
  expect(expo.android.package).toBe('com.reducedrecipes.app');
  expect(expo.android.intentFilters).toHaveLength(1);
  expect(expo.android.intentFilters[0].data[0].pathPrefix).toBe('/recipe/');
});
```

Replace with:

```ts
it('has Android config with package and intentFilters', () => {
  expect(expo.android.package).toBe('com.reducedrecipes.app');
  expect(expo.android.intentFilters).toHaveLength(1);
  const filter = expo.android.intentFilters[0];
  expect(filter.autoVerify).toBe(true);
  const prefixes = filter.data.map((d: { pathPrefix: string }) => d.pathPrefix);
  expect(prefixes).toContain('/recipe/');
  expect(prefixes).toContain('/shared/lists/');
  for (const d of filter.data) {
    expect(d.scheme).toBe('https');
    expect(d.host).toBe('reduced.recipes');
  }
});
```

- [ ] **Step 3: Run the config tests**

Run: `pnpm test -- packages/mobile/src/__tests__/config.test.ts`
Expected: all `app.json` tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/src/__tests__/config.test.ts
git commit -m "test(mobile): assert reduced.recipes deeplink config"
```

---

## Task 8: Move shared-list route file

There are no internal callers of the old route — confirmed by grep (only the route file itself contains `shared-list`). The file move is the entire migration.

**Files:**
- Move: `packages/mobile/app/shared-list/[token].tsx` → `packages/mobile/app/shared/lists/[token].tsx`

- [ ] **Step 1: Reconfirm no callers reference the old path**

Run: `grep -rn "shared-list" /Users/jannik/development/ReducedRecipes/reduced-recipes-monorepo/packages/mobile`
Expected: zero matches.

If any matches appear (other than this plan or the spec), STOP and add a Step 1.5 to update those callers from `/shared-list/` to `/shared/lists/` before moving the file.

- [ ] **Step 2: Create the new directory and move the file**

```bash
mkdir -p packages/mobile/app/shared/lists
git mv packages/mobile/app/shared-list/\[token\].tsx packages/mobile/app/shared/lists/\[token\].tsx
rmdir packages/mobile/app/shared-list
```

- [ ] **Step 3: Typecheck**

Run from repo root: `pnpm typecheck`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/app
git commit -m "refactor(mobile): rename shared-list route to /shared/lists to match web URL"
```

---

## Task 9: Update share-message URL in recipe screen

The in-app "Share" action currently emits `https://reducedrecipes.com/recipe/...`. For deeplinks to work on the receiving device, this must emit the canonical brand domain.

**Files:**
- Modify: `packages/mobile/app/recipe/[id].tsx:46`

- [ ] **Step 1: Update the share message**

In `packages/mobile/app/recipe/[id].tsx`, find:

```ts
message: `Check out this recipe: https://reducedrecipes.com/recipe/${recipe.id}`,
```

Replace with:

```ts
message: `Check out this recipe: https://reduced.recipes/recipe/${recipe.id}`,
```

- [ ] **Step 2: Update the recipe-detail test assertion**

In `packages/mobile/src/__tests__/recipe-detail.test.ts:208`, find:

```ts
expect(source).toContain('reducedrecipes.com/recipe/');
```

Replace with:

```ts
expect(source).toContain('reduced.recipes/recipe/');
```

- [ ] **Step 3: Run the recipe-detail tests**

Run: `pnpm test -- packages/mobile/src/__tests__/recipe-detail.test.ts`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/mobile/app/recipe/[id].tsx packages/mobile/src/__tests__/recipe-detail.test.ts
git commit -m "feat(mobile): share recipe links from canonical reduced.recipes domain"
```

---

## Task 10: Repo-wide regression run

Catch any incidental breakage from the route move or domain change.

- [ ] **Step 1: Typecheck everything**

Run from repo root: `pnpm typecheck`
Expected: passes.

- [ ] **Step 2: Full test suite**

Run from repo root: `pnpm test`
Expected: all tests pass. If a test fails because it asserts on the OLD `reducedrecipes.com` deeplink domain or the OLD `/shared-list/` path, update the assertion to the new value. If a test fails for any other reason, STOP and investigate.

- [ ] **Step 3: Commit any test fixups (if needed)**

If Step 2 required test updates, commit them with a message like:

```bash
git commit -m "test: align remaining assertions with reduced.recipes deeplink domain"
```

If no fixups were needed, skip this step.

---

## Task 11: Document deploy + verification runbook

The verification files won't actually serve until two Worker secrets are set. Capture the commands so this doesn't get lost between writing the code and running it on prod.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-06-deeplinking-design.md`

- [ ] **Step 1: Append a "Deploy & verification runbook" section**

Append to the end of `docs/superpowers/specs/2026-05-06-deeplinking-design.md`:

````markdown
## Deploy & verification runbook

### One-time secret setup (per Worker environment)

The Apple Team ID is in the Apple Developer Portal under "Membership". The Android signing fingerprint is in Play Console → App signing → "App signing key certificate" → SHA-256 certificate fingerprint.

```bash
# From repo root, against the production rr-api worker:
npx wrangler secret put APPLE_TEAM_ID --config packages/workers/wrangler.api.toml
# (paste the team ID when prompted)

npx wrangler secret put ANDROID_CERT_SHA256 --config packages/workers/wrangler.api.toml
# (paste the colon-separated 32-pair SHA256 fingerprint when prompted)
```

### Verify endpoints after deploy

```bash
curl -sI https://reduced.recipes/.well-known/apple-app-site-association
# Expect: 200, content-type: application/json, no redirect

curl -s https://reduced.recipes/.well-known/apple-app-site-association | jq .
# Expect: { "applinks": { "apps": [], "details": [...] } } with the right appID

curl -s https://reduced.recipes/.well-known/assetlinks.json | jq .
# Expect: array of one statement with the right package_name + fingerprint
```

Then validate via Apple's [AASA Validator](https://branch.io/resources/aasa-validator/) and Google's [Statement List Tester](https://developers.google.com/digital-asset-links/tools/generator).

### Build + ship the mobile app

After the Worker is deployed and both endpoints return 200:

1. Cut a new EAS build (any channel that picks up the updated `app.json`).
2. Install on a real iOS and a real Android device.
3. Run the device-level checks listed in the Testing section above.

If iOS Universal Links don't work on the first install: delete the app, restart the device, reinstall. iOS caches AASA per app-install and doesn't refetch eagerly.
````

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-05-06-deeplinking-design.md
git commit -m "docs: add deeplinking deploy and verification runbook"
```

---

## Self-review notes (for the implementer)

After all tasks are done, reread `docs/superpowers/specs/2026-05-06-deeplinking-design.md` and confirm:

- AASA `paths` in code exactly matches `paths` in the spec
- assetlinks `package_name` matches the Android `package` in `app.json`
- iOS `associatedDomains`, Android `intentFilters`, and `extra.router.origin` all reference `reduced.recipes` (no stragglers pointing at `reducedrecipes.com`)
- Share message in `app/recipe/[id].tsx` uses `reduced.recipes`
- The route file lives at `app/shared/lists/[token].tsx` and the old `app/shared-list/` directory is gone
- `EXPO_PUBLIC_API_BASE` was NOT changed (still `reducedrecipes.com`) — this was explicitly out of scope

Out-of-repo follow-ups (not part of this plan, surfaced to the human):

- Set the two Worker secrets per the runbook before depending on the deeplinks
- Cut a new EAS build; old builds in TestFlight/Play don't pick up `associatedDomains` or intent-filter changes
- Manual on-device verification per the spec's Testing section

