# Mobile App Smart Banner — Design

**Date:** 2026-06-08
**Status:** Approved, ready for implementation plan
**Author:** brainstorming session

## Problem

The iOS and Android apps are now publicly available, but the web frontend
(`reduced.recipes`) gives no indication they exist. We want to surface this
*without frustrating users* — no desktop clutter, no repeated nagging, no error
dialogs.

## Decision summary

A dismissible **smart app banner** that renders only on phones, announces the
apps, and offers a one-tap CTA that tries to open the installed app and falls
back to the correct store.

| Aspect            | Choice                                                              |
| ----------------- | ------------------------------------------------------------------- |
| Format            | Slim smart banner, **mobile-only** (iOS/Android UA detection)       |
| Placement         | Top of every page, above `TopBar`, via `Layout.tsx`                 |
| Desktop / tablet  | Renders nothing                                                     |
| Dismissal         | X writes a timestamp to localStorage; hidden **30 days**, then back |
| CTA               | Try to open the app, fall back to the platform store               |
| Dependencies      | None new — Tailwind + existing OKLCH tokens                          |

## Store URLs (locale-neutral)

```ts
const APP_STORE_URL = "https://apps.apple.com/app/id6765878849";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.reducedrecipes.app";
```

These are public store listings (they ship in the client bundle by design).
Locale-neutral forms let each store localize per visitor.

## Components & files

### New: `packages/frontend/src/components/AppSmartBanner.tsx`

Self-contained banner component.

- **Platform detection:** read `navigator.userAgent`.
  - `/iPhone|iPod/` (exclude iPad to keep it phone-only) → iOS
  - `/Android/` → Android
  - neither → return `null` (desktop/tablet see nothing)
- **Dismissal state:** on mount, read `rr_app_banner_dismissed_at` via the
  existing `safeLocalStorage` helper (see `auth.store.ts`). If a timestamp
  exists and is < 30 days old, render `null`. The X click writes the current
  time. Because `Date.now()` is fine in app runtime (this is shipped frontend,
  not a workflow script), compute the 30-day window with
  `Date.now() - stored > 30 * 24 * 60 * 60 * 1000`.
- **Per-platform content:** pick `{ storeUrl, label }` from the detected
  platform. iOS → App Store; Android → Google Play.

### Modified: `packages/frontend/src/components/Layout.tsx`

Render `<AppSmartBanner />` as the first child, above `<TopBar />`, so it sits
at the very top and persists across routes.

## CTA flow — "try app first, safe fallback"

The core anti-frustration requirement. Naively firing `reducedrecipes://` on
iOS can pop a "Cannot Open Page" error when the app is absent — we explicitly
avoid that.

**Android** — use an Intent URL with a native fallback. Android opens the app
if installed, else silently navigates to the Play Store. No error dialog:

```
intent://reduced.recipes/#Intent;scheme=https;package=com.reducedrecipes.app;S.browser_fallback_url=<PLAY_STORE_URL>;end
```

**iOS** — attempt the app via the custom scheme, then race a timeout against
page visibility. If the page is still visible ~1.2s after the attempt, the app
did not open, so redirect to the App Store:

```
const start = Date.now();
window.location.href = "reducedrecipes://";          // attempt app
setTimeout(() => {
  // if we are still here and visible, the app did not open
  if (!document.hidden && Date.now() - start < 1500) {
    window.location.href = APP_STORE_URL;
  }
}, 1200);
```

This suppresses the store redirect when the app *did* open (page goes hidden).
The residual risk — iOS showing its error dialog for the scheme attempt when
the app is absent — is the known tradeoff of "try app first" on mobile web. The
fallback still lands the user on the store in one tap. (If we later decide even
that risk is unacceptable, the escape hatch is to drop the scheme attempt and
send iOS straight to `APP_STORE_URL`; the rest of the component is unchanged.)

The mobile app registers the targets we rely on (verified in
`packages/mobile/app.json`): custom scheme `reducedrecipes`, iOS
`applinks:reduced.recipes`, Android App Links on `reduced.recipes` with
`autoVerify`.

## Styling

Slim bar matching the design system (`--accent`, `--ink`, `--ink-2`, `--rule`,
`--bg-2`):

- Left: small app icon thumbnail (reuse a mobile asset or a compact inline
  mark).
- Middle: `Reduced Recipes` (serif/sans per masthead) + muted subtext
  `Get the app`.
- Right: an accent CTA button (`Get`) and a low-emphasis `×` dismiss control
  with an accessible label.
- Full-bleed, thin, `border-b border-rule`, does not overlap the sticky
  `TopBar` (it stacks above it in normal flow).

## Testing

`packages/frontend/src/components/AppSmartBanner.test.tsx`, following the repo's
source-assertion + light render conventions:

- **Platform gating:** mock `navigator.userAgent` for iOS, Android, and desktop;
  assert the banner renders on phones and renders `null` on desktop and iPad.
- **Dismissal window:** assert the localStorage key `rr_app_banner_dismissed_at`
  is read on mount and written on dismiss; assert a timestamp younger than 30
  days hides the banner and an older one re-shows it.
- **Store wiring:** assert both `APP_STORE_URL` and `PLAY_STORE_URL` constants
  are present and referenced by the CTA logic.
- **CTA per platform:** assert Android path builds the `intent://…` URL with the
  Play fallback, and iOS path attempts the scheme then schedules the App Store
  fallback.

## Out of scope (YAGNI)

- Desktop "get the app" footer/QR — not requested.
- A/B testing or analytics on banner conversion.
- Deferred-deep-link (routing the user to the same recipe inside the app).
- iPad-specific handling beyond "treat as not-a-phone, show nothing."

## Anti-frustration checklist

- Desktop users: never see it.
- Dismiss is honored for 30 days, persisted client-side.
- One tap to the store in every fallback case.
- No new dependencies, no layout shift on desktop (renders nothing).
