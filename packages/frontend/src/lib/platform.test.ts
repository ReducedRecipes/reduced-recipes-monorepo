import { describe, it, expect, afterEach } from "vitest";
import {
  detectMobilePlatform,
  buildAndroidIntentUrl,
  APP_STORE_URL,
  PLAY_STORE_URL,
  APP_SCHEME_URL,
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

  it("exposes the app custom scheme", () => {
    expect(APP_SCHEME_URL).toBe("reducedrecipes://");
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
