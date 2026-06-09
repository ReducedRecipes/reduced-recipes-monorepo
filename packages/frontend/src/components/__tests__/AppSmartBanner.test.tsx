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
