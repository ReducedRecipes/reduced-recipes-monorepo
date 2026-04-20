import { describe, it, expect } from "vitest";
import {
  formatQty,
  parseQty,
  parseIngredient,
  scaleIngredient,
} from "../formatQty";

describe("formatQty", () => {
  it("returns empty string for null/undefined/0", () => {
    expect(formatQty(null)).toBe("");
    expect(formatQty(undefined)).toBe("");
    expect(formatQty(0)).toBe("");
  });

  it("formats whole numbers", () => {
    expect(formatQty(1)).toBe("1");
    expect(formatQty(12)).toBe("12");
  });

  it("formats common fractions", () => {
    expect(formatQty(0.5)).toBe("½");
    expect(formatQty(0.25)).toBe("¼");
    expect(formatQty(0.75)).toBe("¾");
    expect(formatQty(0.333)).toBe("⅓");
    expect(formatQty(0.667)).toBe("⅔");
  });

  it("formats mixed numbers", () => {
    expect(formatQty(1.5)).toBe("1 ½");
    expect(formatQty(2.25)).toBe("2 ¼");
    expect(formatQty(3.75)).toBe("3 ¾");
  });
});

describe("parseQty", () => {
  it("parses whole numbers", () => {
    expect(parseQty("2")).toBe(2);
    expect(parseQty("10")).toBe(10);
  });

  it("parses fractions", () => {
    expect(parseQty("1/2")).toBe(0.5);
    expect(parseQty("3/4")).toBe(0.75);
  });

  it("parses mixed numbers", () => {
    expect(parseQty("1 1/2")).toBe(1.5);
    expect(parseQty("2 1/4")).toBe(2.25);
  });

  it("parses vulgar fractions", () => {
    expect(parseQty("½")).toBe(0.5);
    expect(parseQty("1½")).toBe(1.5);
  });

  it("returns null for empty string", () => {
    expect(parseQty("")).toBeNull();
  });
});

describe("parseIngredient", () => {
  it("parses qty + unit + item", () => {
    const result = parseIngredient("2 cups flour");
    expect(result.qty).toBe(2);
    expect(result.unit).toBe("cups");
    expect(result.item).toBe("flour");
  });

  it("parses qty + item (no unit)", () => {
    const result = parseIngredient("3 eggs");
    expect(result.qty).toBe(3);
    expect(result.unit).toBe("");
    expect(result.item).toBe("eggs");
  });

  it("parses item only (no qty)", () => {
    const result = parseIngredient("salt to taste");
    expect(result.qty).toBeNull();
    expect(result.item).toBe("salt to taste");
  });

  it("parses fraction quantities", () => {
    const result = parseIngredient("½ tsp salt");
    expect(result.qty).toBe(0.5);
    expect(result.unit).toBe("tsp");
    expect(result.item).toBe("salt");
  });
});

describe("scaleIngredient", () => {
  it("scales quantity up", () => {
    expect(scaleIngredient("2 cups flour", 2)).toBe("4 cups flour");
  });

  it("scales quantity down with fractions", () => {
    expect(scaleIngredient("1 cup sugar", 0.5)).toBe("½ cup sugar");
  });

  it("leaves text unchanged when no qty", () => {
    expect(scaleIngredient("salt to taste", 2)).toBe("salt to taste");
  });

  it("scales items without units", () => {
    expect(scaleIngredient("3 eggs", 2)).toBe("6 eggs");
  });
});
