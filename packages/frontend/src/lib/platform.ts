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
