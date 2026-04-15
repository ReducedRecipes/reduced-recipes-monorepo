import { describe, it, expect } from "vitest";
import { routes } from "../routes";
import { colors, fontSizes, radius, spacing, fonts, shadow } from "../theme";

describe("constants integration – routes and theme co-export", () => {
  it("routes.recipe returns a valid string path", () => {
    const path = routes.recipe("abc");
    expect(path).toBe("/recipe/abc");
    expect(typeof path).toBe("string");
  });

  it("routes helpers produce paths starting with /", () => {
    expect(routes.cook("x")).toMatch(/^\//);
    expect(routes.tag("italian")).toMatch(/^\//);
    expect(routes.cuisine("mexican")).toMatch(/^\//);
    expect(routes.site("example.com")).toMatch(/^\//);
    expect(routes.onboarding).toMatch(/^\//);
  });

  it("colors.orange is a valid hex string", () => {
    expect(colors.orange).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("fontSizes.base is a positive number", () => {
    expect(fontSizes.base).toBeGreaterThan(0);
    expect(typeof fontSizes.base).toBe("number");
  });

  it("radius.md is a positive number", () => {
    expect(radius.md).toBeGreaterThan(0);
    expect(typeof radius.md).toBe("number");
  });

  it("spacing values are positive numbers", () => {
    expect(spacing[4]).toBeGreaterThan(0);
    expect(typeof spacing[4]).toBe("number");
  });

  it("fonts exports string values", () => {
    expect(typeof fonts.display).toBe("string");
    expect(typeof fonts.body).toBe("string");
  });

  it("shadow.sm has required shadow properties", () => {
    expect(shadow.sm).toHaveProperty("shadowColor");
    expect(shadow.sm).toHaveProperty("shadowOffset");
    expect(shadow.sm).toHaveProperty("shadowRadius");
    expect(shadow.sm).toHaveProperty("elevation");
  });

  it("dark theme colors are valid hex strings", () => {
    expect(colors.dark.bg).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(colors.dark.orange).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});
