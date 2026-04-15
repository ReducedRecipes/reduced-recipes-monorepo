import { describe, it, expect } from "vitest";
import { routes } from "../routes";

describe("routes", () => {
  describe("recipe", () => {
    it("returns correct path for a normal id", () => {
      expect(routes.recipe("123")).toBe("/recipe/123");
    });

    it("handles special characters in id", () => {
      expect(routes.recipe("hello world")).toBe("/recipe/hello world");
    });

    it("handles URL-encoded values", () => {
      expect(routes.recipe("hello%20world")).toBe("/recipe/hello%20world");
    });
  });

  describe("cook", () => {
    it("returns correct path for a normal id", () => {
      expect(routes.cook("abc")).toBe("/cook/abc");
    });

    it("handles special characters", () => {
      expect(routes.cook("a&b=c")).toBe("/cook/a&b=c");
    });

    it("handles URL-encoded values", () => {
      expect(routes.cook("a%26b")).toBe("/cook/a%26b");
    });
  });

  describe("tag", () => {
    it("returns correct path for a normal tag", () => {
      expect(routes.tag("vegan")).toBe("/tag/vegan");
    });

    it("handles special characters", () => {
      expect(routes.tag("gluten-free")).toBe("/tag/gluten-free");
    });

    it("handles URL-encoded values", () => {
      expect(routes.tag("mac%20%26%20cheese")).toBe("/tag/mac%20%26%20cheese");
    });
  });

  describe("cuisine", () => {
    it("returns correct path for a normal cuisine", () => {
      expect(routes.cuisine("italian")).toBe("/cuisine/italian");
    });

    it("handles special characters", () => {
      expect(routes.cuisine("café")).toBe("/cuisine/café");
    });

    it("handles URL-encoded values", () => {
      expect(routes.cuisine("caf%C3%A9")).toBe("/cuisine/caf%C3%A9");
    });
  });

  describe("site", () => {
    it("returns correct path for a normal domain", () => {
      expect(routes.site("example.com")).toBe("/site/example.com");
    });

    it("handles special characters", () => {
      expect(routes.site("my-site.co.uk")).toBe("/site/my-site.co.uk");
    });

    it("handles URL-encoded values", () => {
      expect(routes.site("example%2Ecom")).toBe("/site/example%2Ecom");
    });
  });

  describe("onboarding", () => {
    it("returns the onboarding path", () => {
      expect(routes.onboarding).toBe("/onboarding");
    });
  });
});
