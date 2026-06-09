# Mobile App Smart Banner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dismissible, mobile-only smart banner to the web frontend announcing the iOS/Android apps, with a "try app, else store" CTA.

**Architecture:** Pure platform-detection + URL-building helpers in `src/lib/platform.ts` (fully unit-testable, no React), consumed by a focused `AppSmartBanner` component that handles dismissal state and rendering, mounted once at the top of `Layout.tsx`. Desktop/tablet render nothing.

**Tech Stack:** React 19, TypeScript, Tailwind (OKLCH tokens), Vitest + @testing-library/react (jsdom).

**Spec:** `docs/superpowers/specs/2026-06-08-mobile-app-smart-banner-design.md`

---

## File Structure

| File | Responsibility |
| ---- | -------------- |
| `packages/frontend/src/lib/platform.ts` (create) | Pure helpers: `detectMobilePlatform()`, store-URL constants, `buildAndroidIntentUrl()`. No React, no DOM side effects beyond reading `navigator`. |
| `packages/frontend/src/lib/platform.test.ts` (create) | Unit tests for detection + intent URL + constants. |
| `packages/frontend/src/components/AppSmartBanner.tsx` (create) | The banner: dismissal window, per-platform render, CTA handler. |
| `packages/frontend/src/components/__tests__/AppSmartBanner.test.tsx` (create) | Gating, dismissal, per-platform CTA render. |
| `packages/frontend/src/components/Layout.tsx` (modify) | Mount `<AppSmartBanner />` above `<TopBar />`. |

All commands run from `packages/frontend`. Run a single test file with:
`pnpm test -- src/lib/platform.test.ts` (from repo root) or `pnpm vitest run <path>` inside the package — match whatever the repo's existing test scripts use. The examples below use `pnpm test --`.

---

## Task 1: Platform detection + URL helpers

**Files:**
- Create: `packages/frontend/src/lib/platform.ts`
- Test: `packages/frontend/src/lib/platform.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/lib/platform.test.ts`:

```ts
import { describe, it, expect, afterEach } from "vitest";
import {
  detectMobilePlatform,
  buildAndroidIntentUrl,
  APP_STORE_URL,
  PLAY_STORE_URL,
} from "./platform";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

function setUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

afterEach(() => setUA(DESKTOP_UA));

describe("detectMobilePlatform", () => {
  it("detects iPhone as ios", () => {
    setUA(IPHONE_UA);
    expect(detectMobilePlatform()).toBe("ios");
  });

  it("detects Android as android", () => {
    setUA(ANDROID_UA);
    expect(detectMobilePlatform()).toBe("android");
  });

  it("returns null for iPad (phone-only)", () => {
    setUA(IPAD_UA);
    expect(detectMobilePlatform()).toBeNull();
  });

  it("returns null for desktop", () => {
    setUA(DESKTOP_UA);
    expect(detectMobilePlatform()).toBeNull();
  });
});

describe("store URLs", () => {
  it("uses the locale-neutral App Store listing", () => {
    expect(APP_STORE_URL).toBe("https://apps.apple.com/app/id6765878849");
  });

  it("uses the locale-neutral Play Store listing", () => {
    expect(PLAY_STORE_URL).toBe(
      "https://play.google.com/store/apps/details?id=com.reducedrecipes.app",
    );
  });
});

describe("buildAndroidIntentUrl", () => {
  it("builds an intent URL with the Play Store fallback", () => {
    const url = buildAndroidIntentUrl();
    expect(url.startsWith("intent://reduced.recipes/#Intent;")).toBe(true);
    expect(url).toContain("scheme=https");
    expect(url).toContain("package=com.reducedrecipes.app");
    expect(url).toContain(
      `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)}`,
    );
    expect(url.endsWith(";end")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/lib/platform.test.ts`
Expected: FAIL — cannot resolve `./platform` / exports undefined.

- [ ] **Step 3: Write minimal implementation**

Create `packages/frontend/src/lib/platform.ts`:

```ts
export type MobilePlatform = "ios" | "android";

// Public store listings (locale-neutral so each store localizes per visitor).
// These ship in the client bundle by design.
export const APP_STORE_URL = "https://apps.apple.com/app/id6765878849";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.reducedrecipes.app";

// Custom scheme registered by the mobile app (packages/mobile/app.json).
export const APP_SCHEME_URL = "reducedrecipes://";

/**
 * Returns the phone platform of the current browser, or null for
 * desktop/tablet. iPad is intentionally excluded to keep this phone-only.
 */
export function detectMobilePlatform(): MobilePlatform | null {
  const ua =
    (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPod/i.test(ua)) return "ios";
  return null;
}

/**
 * Android Intent URL: opens the app if installed, otherwise Android itself
 * navigates to the Play Store via browser_fallback_url. No error dialog.
 */
export function buildAndroidIntentUrl(): string {
  return (
    "intent://reduced.recipes/#Intent;scheme=https;" +
    "package=com.reducedrecipes.app;" +
    `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};end`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/lib/platform.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/lib/platform.ts packages/frontend/src/lib/platform.test.ts
git commit -m "feat(frontend): add mobile platform detection and store URL helpers"
```

---

## Task 2: AppSmartBanner component

**Files:**
- Create: `packages/frontend/src/components/AppSmartBanner.tsx`
- Test: `packages/frontend/src/components/__tests__/AppSmartBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `packages/frontend/src/components/__tests__/AppSmartBanner.test.tsx`:

```tsx
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppSmartBanner } from "../AppSmartBanner";

const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DISMISS_KEY = "rr_app_banner_dismissed_at";

function setUA(ua: string) {
  Object.defineProperty(window.navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  setUA(DESKTOP_UA);
});

describe("AppSmartBanner", () => {
  it("renders nothing on desktop", () => {
    setUA(DESKTOP_UA);
    const { container } = render(<AppSmartBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the banner on a phone", () => {
    setUA(IPHONE_UA);
    render(<AppSmartBanner />);
    expect(screen.getByText("Reduced Recipes")).toBeDefined();
    expect(screen.getByText("Get the app")).toBeDefined();
    expect(screen.getByRole("button", { name: "Get the app on the App Store" })).toBeDefined();
  });

  it("labels the CTA for the Play Store on Android", () => {
    setUA(ANDROID_UA);
    render(<AppSmartBanner />);
    expect(
      screen.getByRole("button", { name: "Get the app on Google Play" }),
    ).toBeDefined();
  });

  it("hides and persists a timestamp when dismissed", () => {
    setUA(IPHONE_UA);
    const { container } = render(<AppSmartBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(container.firstChild).toBeNull();
    expect(localStorage.getItem(DISMISS_KEY)).not.toBeNull();
  });

  it("stays hidden when dismissed within the last 30 days", () => {
    setUA(IPHONE_UA);
    const fiveDaysAgo = Date.now() - 5 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(fiveDaysAgo));
    const { container } = render(<AppSmartBanner />);
    expect(container.firstChild).toBeNull();
  });

  it("re-shows when the dismissal is older than 30 days", () => {
    setUA(IPHONE_UA);
    const fortyDaysAgo = Date.now() - 40 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_KEY, String(fortyDaysAgo));
    render(<AppSmartBanner />);
    expect(screen.getByText("Reduced Recipes")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/components/__tests__/AppSmartBanner.test.tsx`
Expected: FAIL — cannot resolve `../AppSmartBanner`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/frontend/src/components/AppSmartBanner.tsx`:

```tsx
import { useState, useEffect } from "react";
import {
  detectMobilePlatform,
  buildAndroidIntentUrl,
  APP_STORE_URL,
  APP_SCHEME_URL,
  type MobilePlatform,
} from "../lib/platform";

const DISMISS_KEY = "rr_app_banner_dismissed_at";
const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Guarded localStorage access (mirrors the pattern in stores/auth.store.ts;
// that helper is module-private, so we replicate the minimal version here).
function safeStorage(): Storage | null {
  try {
    if (
      typeof localStorage !== "undefined" &&
      typeof localStorage.getItem === "function"
    ) {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

function wasRecentlyDismissed(): boolean {
  const raw = safeStorage()?.getItem(DISMISS_KEY);
  if (!raw) return false;
  const ts = Number(raw);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < DISMISS_WINDOW_MS;
}

const CTA: Record<MobilePlatform, string> = {
  ios: "Get the app on the App Store",
  android: "Get the app on Google Play",
};

// Try to open the installed app; fall back to the store.
function openApp(platform: MobilePlatform): void {
  if (platform === "android") {
    // Android handles the store fallback natively via browser_fallback_url.
    window.location.href = buildAndroidIntentUrl();
    return;
  }
  // iOS: attempt the scheme, then redirect to the App Store only if the page
  // is still visible (i.e. the app did not take over).
  const start = Date.now();
  window.location.href = APP_SCHEME_URL;
  window.setTimeout(() => {
    if (!document.hidden && Date.now() - start < 1500) {
      window.location.href = APP_STORE_URL;
    }
  }, 1200);
}

export function AppSmartBanner() {
  const [platform, setPlatform] = useState<MobilePlatform | null>(null);

  useEffect(() => {
    if (wasRecentlyDismissed()) return;
    setPlatform(detectMobilePlatform());
  }, []);

  if (!platform) return null;

  const handleDismiss = () => {
    safeStorage()?.setItem(DISMISS_KEY, String(Date.now()));
    setPlatform(null);
  };

  return (
    <div className="flex items-center gap-3 border-b border-rule bg-bg-2 px-4 py-2">
      <img
        src="/icon-192.png"
        alt=""
        className="h-9 w-9 shrink-0 rounded-xl"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">Reduced Recipes</p>
        <p className="truncate text-xs text-ink-2">Get the app</p>
      </div>
      <button
        type="button"
        onClick={() => openApp(platform)}
        aria-label={CTA[platform]}
        className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-ink"
      >
        Get
      </button>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss"
        className="shrink-0 px-1 text-xl leading-none text-ink-3"
      >
        &times;
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/components/__tests__/AppSmartBanner.test.tsx`
Expected: PASS. (jsdom may log "Not implemented: navigation" if any CTA click fires; the dismissal/gating tests above do not click "Get", so no navigation occurs.)

- [ ] **Step 5: Commit**

```bash
git add packages/frontend/src/components/AppSmartBanner.tsx packages/frontend/src/components/__tests__/AppSmartBanner.test.tsx
git commit -m "feat(frontend): add dismissible mobile app smart banner component"
```

---

## Task 3: Mount the banner in Layout

**Files:**
- Modify: `packages/frontend/src/components/Layout.tsx`

- [ ] **Step 1: Add the import and render the banner**

In `packages/frontend/src/components/Layout.tsx`, add the import after the existing component imports (after line 5, the `DietaryOnboarding` import):

```tsx
import { AppSmartBanner } from "./AppSmartBanner";
```

Then render it as the first visible child inside the wrapper, immediately before `<TopBar ... />` (it sits above the sticky header in normal flow). The return becomes:

```tsx
  return (
    <div className="min-h-screen bg-bg">
      <ScrollToTop />
      <DietaryOnboarding
        isOpen={showDietaryOnboarding}
        onClose={handleDietaryOnboardingClose}
      />
      <AppSmartBanner />
      <TopBar recipeCount={recipeCount} />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
```

- [ ] **Step 2: Verify the existing Layout tests still pass**

The existing `Layout.test.tsx` runs under jsdom's default (desktop) user agent, so `AppSmartBanner` renders `null` and must not affect any assertion.

Run: `pnpm test -- src/components/__tests__/Layout.test.tsx`
Expected: PASS — all existing Layout assertions unchanged.

- [ ] **Step 3: Run typecheck and the full frontend test suite**

Run: `pnpm typecheck`
Expected: PASS — no type errors.

Run: `pnpm test`
Expected: PASS — including the new `platform` and `AppSmartBanner` tests.

- [ ] **Step 4: Commit**

```bash
git add packages/frontend/src/components/Layout.tsx
git commit -m "feat(frontend): mount mobile app smart banner above the top bar"
```

---

## Manual verification (optional, after merge or in preview)

- Load `reduced.recipes` on a desktop browser → no banner.
- Open device emulation with an iPhone user agent → banner shows "Reduced Recipes / Get the app" with a "Get" button; tapping it attempts the app then the App Store; the `×` hides it and it stays hidden for 30 days (check `localStorage` key `rr_app_banner_dismissed_at`).
- Repeat with an Android user agent → "Get" routes through the intent URL to Google Play when the app is absent.

---

## Self-Review Notes

- **Spec coverage:** mobile-only gating (Task 1 `detectMobilePlatform`, Task 2 render-null tests), placement above TopBar (Task 3), 30-day dismissal (Task 2 tests), Android intent fallback + iOS scheme/timeout (Task 1 + Task 2 `openApp`), real locale-neutral store URLs (Task 1 constants), Tailwind/OKLCH styling (Task 2 JSX), tests per the repo convention (all tasks). The spec's "reuse a mobile asset or inline mark" is resolved to the existing served asset `/icon-192.png`.
- **iOS error-dialog tradeoff:** carried over from the approved spec; escape hatch is to replace the `openApp` iOS branch body with `window.location.href = APP_STORE_URL;`.
- **Type consistency:** `MobilePlatform` type, `detectMobilePlatform`, `buildAndroidIntentUrl`, `APP_STORE_URL`, `PLAY_STORE_URL`, `APP_SCHEME_URL`, and the `DISMISS_KEY` string are used identically across tasks and tests.
