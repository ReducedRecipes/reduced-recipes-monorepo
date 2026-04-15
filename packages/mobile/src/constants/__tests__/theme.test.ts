import { describe, it, expect } from "vitest";
import { fonts, fontSizes, colors, spacing, radius, shadow } from "../theme";

describe("fonts", () => {
  it("has expected keys with string values", () => {
    expect(fonts).toHaveProperty("display");
    expect(fonts).toHaveProperty("body");
    expect(fonts).toHaveProperty("bodyMed");
    expect(fonts).toHaveProperty("mono");

    for (const value of Object.values(fonts)) {
      expect(typeof value).toBe("string");
    }
  });
});

describe("fontSizes", () => {
  const expectedKeys = ["xs", "sm", "base", "lg", "xl", "2xl", "3xl", "4xl"];

  it("has all expected keys", () => {
    for (const key of expectedKeys) {
      expect(fontSizes).toHaveProperty(key);
    }
  });

  it("has numeric values", () => {
    for (const value of Object.values(fontSizes)) {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe("colors", () => {
  const expectedLightKeys = [
    "bg",
    "bgCard",
    "bgMuted",
    "ink",
    "inkMuted",
    "inkFaint",
    "orange",
    "orangeLight",
    "success",
    "warning",
    "error",
  ];

  it("has all expected light-mode keys", () => {
    for (const key of expectedLightKeys) {
      expect(colors).toHaveProperty(key);
    }
  });

  it("has a dark sub-object with matching keys", () => {
    expect(colors).toHaveProperty("dark");
    const darkKeys = [
      "bg",
      "bgCard",
      "bgMuted",
      "ink",
      "inkMuted",
      "inkFaint",
      "orange",
      "orangeLight",
      "success",
      "warning",
      "error",
    ];
    for (const key of darkKeys) {
      expect(colors.dark).toHaveProperty(key);
    }
  });

  it("has string color values", () => {
    for (const [key, value] of Object.entries(colors)) {
      if (key === "dark") continue;
      expect(typeof value).toBe("string");
    }
    for (const value of Object.values(colors.dark)) {
      expect(typeof value).toBe("string");
    }
  });
});

describe("spacing", () => {
  it("has expected keys with numeric values", () => {
    const expectedKeys = [
      "px",
      "0.5",
      "1",
      "1.5",
      "2",
      "2.5",
      "3",
      "3.5",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "14",
      "16",
    ];
    for (const key of expectedKeys) {
      expect(spacing).toHaveProperty(key);
    }
  });

  it("has positive numeric values", () => {
    for (const value of Object.values(spacing)) {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe("radius", () => {
  const expectedKeys = ["sm", "md", "lg", "xl", "full"];

  it("has all expected keys", () => {
    for (const key of expectedKeys) {
      expect(radius).toHaveProperty(key);
    }
  });

  it("has positive numeric values", () => {
    for (const value of Object.values(radius)) {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThan(0);
    }
  });
});

describe("shadow", () => {
  it("has sm and md keys", () => {
    expect(shadow).toHaveProperty("sm");
    expect(shadow).toHaveProperty("md");
  });

  it.each(["sm", "md"] as const)("shadow.%s has valid shadow properties", (size) => {
    const s = shadow[size];
    expect(s).toHaveProperty("shadowColor");
    expect(typeof s.shadowColor).toBe("string");
    expect(s).toHaveProperty("shadowOffset");
    expect(typeof s.shadowOffset.width).toBe("number");
    expect(typeof s.shadowOffset.height).toBe("number");
    expect(s).toHaveProperty("shadowOpacity");
    expect(typeof s.shadowOpacity).toBe("number");
    expect(s).toHaveProperty("shadowRadius");
    expect(typeof s.shadowRadius).toBe("number");
    expect(s).toHaveProperty("elevation");
    expect(typeof s.elevation).toBe("number");
  });
});
