# Deeplinking Design

**Date:** 2026-05-06
**Status:** Approved, ready for implementation plan
**Scope:** iOS Universal Links + Android App Links for `reduced.recipes`, covering recipe pages and shared shopping lists

## Goal

When someone shares a `reduced.recipes` link to a recipe or shared shopping list, the link opens directly in the ReducedRecipes mobile app for users who have it installed. Users without the app see the existing web page, with no install prompt or banner.

## Non-goals

- Marketing attribution, install tracking, or campaign deep links
- Smart App Banner or any custom "Open in app" prompt on the web
- Universal-Link coverage for browse routes (`/tag`, `/cuisine`, `/site`, `/user`, `/search`, `/`)
- Any change to the legacy `reducedrecipes.com` API host
- OAuth callback handling (already solved by the existing custom `reducedrecipes://` scheme; left untouched)

## URL surface

Only two route patterns are deeplinked, on the canonical brand domain `reduced.recipes`.

| Web URL | Mobile route |
| --- | --- |
| `https://reduced.recipes/recipe/:id` | `app/recipe/[id].tsx` |
| `https://reduced.recipes/shared/lists/:token` | `app/shared/lists/[token].tsx` (renamed from `app/shared-list/[token].tsx`) |

Aligning the mobile route to the web URL keeps the public URL contract authoritative and removes the need for a custom Expo Router linking translation layer.

All other web routes fall through to the browser. They are explicitly excluded from the iOS AASA `paths` array via `NOT` entries, and are not declared as Android intent-filter `pathPrefix` values, so neither OS hands them to the app.

## Components and changes

### 1. `rr-api` Worker — serve verification files

Two new `GET` routes on `reduced.recipes` (the apex host already handled by `rr-api`):

**`GET /.well-known/apple-app-site-association`**

Headers:

- `Content-Type: application/json`
- `Cache-Control: public, max-age=3600`
- 200 only, no redirect

Body:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "<APPLE_TEAM_ID>.com.reducedrecipes.app",
        "paths": [
          "NOT /recipe/",
          "NOT /shared/lists/",
          "/recipe/*",
          "/shared/lists/*"
        ]
      }
    ]
  }
}
```

`<APPLE_TEAM_ID>` is the Apple Developer Team ID associated with the existing iOS provisioning profile. Per the project's sensitive-data policy, this account-identifier value is provided to the Worker as a secret (set via `wrangler secret put`) and never inlined in the repo. The two `NOT` entries exclude bare prefix paths (`/recipe/` and `/shared/lists/`) so iOS does not try to claim those listing-style URLs. **Order matters:** Apple evaluates `paths` top-to-bottom and stops at the first match, so the `NOT` entries must precede the wildcard entries — otherwise a bare `/recipe/` URL would be matched by `/recipe/*` (asterisk matches the empty substring) before the exclusion is ever evaluated.

**`GET /.well-known/assetlinks.json`**

Headers:

- `Content-Type: application/json`
- `Cache-Control: public, max-age=3600`
- 200 only, no redirect

Body:

```json
[
  {
    "relation": ["delegate_permission/common.handle_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.reducedrecipes.app",
      "sha256_cert_fingerprints": ["<PLAY_APP_SIGNING_SHA256>"]
    }
  }
]
```

`<PLAY_APP_SIGNING_SHA256>` comes from Play Console (App signing → App signing key certificate). Provided as a Worker secret, not inlined in source.

**Why the Worker, not the static frontend:** Apple's AASA file has no extension and must be served with `Content-Type: application/json` over HTTPS at the exact path `/.well-known/apple-app-site-association`, with no redirect. Static hosts often mis-serve content-type or follow redirects to canonicalise the URL, both of which silently break verification. Workers give deterministic header control.

### 2. Mobile app config (`packages/mobile/app.json`)

Three changes, all switching from `reducedrecipes.com` to `reduced.recipes`.

**iOS associated domains:**

```json
"associatedDomains": [
  "applinks:reduced.recipes",
  "webcredentials:reduced.recipes"
]
```

**Android intent filter** (replace single `/recipe/` filter with two-prefix filter on the new host):

```json
"intentFilters": [
  {
    "action": "VIEW",
    "autoVerify": true,
    "data": [
      { "scheme": "https", "host": "reduced.recipes", "pathPrefix": "/recipe/" },
      { "scheme": "https", "host": "reduced.recipes", "pathPrefix": "/shared/lists/" }
    ],
    "category": ["BROWSABLE", "DEFAULT"]
  }
]
```

`autoVerify: true` triggers Android to fetch `https://reduced.recipes/.well-known/assetlinks.json` at install/update time. On success, App Links bypass the disambiguation chooser.

**Expo Router origin:**

```json
"extra": {
  "router": { "origin": "https://reduced.recipes" }
}
```

The custom URL scheme `reducedrecipes` is preserved (it is the OAuth callback target) and is independent of this work.

### 3. Mobile route rename

Move `app/shared-list/[token].tsx` to `app/shared/lists/[token].tsx`. Delete the empty `app/shared-list/` directory.

Sweep mobile for callers and update them to the new path:

- `router.push("/shared-list/...")` → `router.push("/shared/lists/...")`
- `router.replace("/shared-list/...")` → `router.replace("/shared/lists/...")`
- `<Link href="/shared-list/...">` → `<Link href="/shared/lists/...">`
- Any string templating that builds the path
- Any custom-scheme variant: `reducedrecipes://shared-list/...` → `reducedrecipes://shared/lists/...`
- Any test fixtures asserting on the old path

After the rename, Expo Router file-system routes match the web URL paths exactly, so default linking inference works without a custom `linking` config.

## Data flow

```
Click https://reduced.recipes/recipe/abc on phone
        |
        v
   App installed?
   /            \
  yes            no
   |              |
   v              v
iOS/Android   browser opens
hand URL to   reduced.recipes
the app       (existing web page)
   |
   v
expo-router maps
/recipe/abc -> app/recipe/[id].tsx
   |
   v
recipe screen renders with id=abc
```

iOS-only behaviour worth noting: when the app is *already foregrounded*, Universal Links arrive as a `continueUserActivity` event rather than a cold start; Expo Router handles this automatically once `associatedDomains` is configured.

## Security considerations

- The Apple Team ID and Android signing-cert SHA256 become observable from the public well-known endpoints once deployed, but per the project's sensitive-data policy they are still loaded from Worker secrets rather than inlined in source — keeping the canonical value in one place and out of git.
- Universal Links can only be claimed by an app whose `appID` matches the AASA-listed value AND whose installer sees a 200 from the well-known endpoint at install time. There is no way for a third-party app to hijack `reduced.recipes` links without controlling either Apple's signing for our bundle ID or the `reduced.recipes` DNS.
- Both well-known endpoints are read-only and unauthenticated, served from the same Worker that already serves the API. No new attack surface.

## Testing

### Automated (CI)

Add tests in `packages/workers/src/api.test.ts`:

- `GET /.well-known/apple-app-site-association` returns 200, `Content-Type: application/json`, body parses as JSON, `applinks.details[0].appID` ends with `.com.reducedrecipes.app`, `applinks.details[0].paths` contains `/recipe/*` and `/shared/lists/*`.
- `GET /.well-known/assetlinks.json` returns 200, `Content-Type: application/json`, body parses as JSON, `target.package_name === "com.reducedrecipes.app"`, `sha256_cert_fingerprints` has exactly one entry of length 95 (32 hex pairs separated by colons).

These guard against accidental handler-shape regressions.

### Manual (post-deploy, post-EAS-build)

iOS:

1. Install a TestFlight or dev build on a real device.
2. From Notes or iMessage, long-press a `https://reduced.recipes/recipe/<id>` link. Expect "Open in ReducedRecipes" in the action sheet. Tap it — app opens on the recipe screen.
3. Repeat for `https://reduced.recipes/shared/lists/<token>`.
4. Verify `https://reduced.recipes/tag/dinner` does NOT offer the app (still routes to Safari).
5. Validate AASA via Apple's tooling: `curl -sI https://reduced.recipes/.well-known/apple-app-site-association` shows `application/json`, no redirect; paste the URL into a public AASA validator.

Android:

1. Install a dev build on a real device.
2. `adb shell pm get-app-links com.reducedrecipes.app` should list `reduced.recipes` with status `verified`.
3. Tap a `reduced.recipes/recipe/...` link from Gmail or a chat app — app opens directly with no disambiguation chooser.
4. Validate `assetlinks.json` via Google's Digital Asset Links tester.

Web fallback:

1. Uninstall the app on both platforms.
2. Tap the same links — web page loads, no banner, no prompt.

## Out of scope / deferred

- Smart App Banner on the web (declined per Q4 — keep web clean).
- App Links coverage for `/tag`, `/cuisine`, `/site`, `/user`, `/`, `/search` — easy to add later by extending the AASA `paths` array and Android intent filters once data justifies it.
- Detox / automated E2E for Universal Links — manual-on-device is more reliable than simulator.
- Migration plan for any in-the-wild `reducedrecipes.com` recipe links — assumed already redirecting at the edge, or low enough volume not to matter.

## Open questions

None blocking implementation. The two values that need to be sourced rather than guessed (`<APPLE_TEAM_ID>` and `<PLAY_APP_SIGNING_SHA256>`) will be pulled during the implementation phase from the iOS provisioning profile and Play Console respectively, and stored as Worker secrets.
