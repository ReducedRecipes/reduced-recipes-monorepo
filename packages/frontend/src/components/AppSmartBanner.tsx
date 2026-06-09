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
