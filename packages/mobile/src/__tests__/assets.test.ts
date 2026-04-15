import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const MOBILE_ROOT = path.resolve(__dirname, "../..");

describe("assets directory", () => {
  describe("image assets referenced in app.json", () => {
    const requiredImages = [
      "assets/icon.png",
      "assets/splash.png",
      "assets/adaptive-icon.png",
      "assets/favicon.png",
      "assets/notification-icon.png",
    ];

    it.each(requiredImages)("%s exists and is a valid PNG", (file) => {
      const filePath = path.join(MOBILE_ROOT, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const buf = fs.readFileSync(filePath);
      // PNG magic bytes
      expect(buf[0]).toBe(0x89);
      expect(buf[1]).toBe(0x50); // P
      expect(buf[2]).toBe(0x4e); // N
      expect(buf[3]).toBe(0x47); // G
    });
  });

  describe("font assets referenced in _layout.tsx", () => {
    const requiredFonts = [
      "assets/fonts/Lora-SemiBold.ttf",
      "assets/fonts/DMSans-Regular.ttf",
      "assets/fonts/DMSans-Medium.ttf",
    ];

    it.each(requiredFonts)("%s exists and is non-empty", (file) => {
      const filePath = path.join(MOBILE_ROOT, file);
      expect(fs.existsSync(filePath)).toBe(true);

      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  it("app.json image references match existing files", () => {
    const appJson = JSON.parse(
      fs.readFileSync(path.join(MOBILE_ROOT, "app.json"), "utf-8")
    );
    const expo = appJson.expo;

    // Check icon
    const iconPath = path.join(MOBILE_ROOT, expo.icon);
    expect(fs.existsSync(iconPath)).toBe(true);

    // Check splash
    const splashPath = path.join(MOBILE_ROOT, expo.splash.image);
    expect(fs.existsSync(splashPath)).toBe(true);

    // Check adaptive icon
    const adaptivePath = path.join(
      MOBILE_ROOT,
      expo.android.adaptiveIcon.foregroundImage
    );
    expect(fs.existsSync(adaptivePath)).toBe(true);

    // Check favicon
    const faviconPath = path.join(MOBILE_ROOT, expo.web.favicon);
    expect(fs.existsSync(faviconPath)).toBe(true);
  });
});
