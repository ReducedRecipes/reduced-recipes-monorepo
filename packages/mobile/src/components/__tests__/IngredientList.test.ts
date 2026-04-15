import { describe, it, expect } from "vitest";
import { parseQuantity, scaleIngredient } from "../../lib/scale-ingredient";

describe("parseQuantity", () => {
  it("parses integer quantities", () => {
    expect(parseQuantity("2 cups flour")).toEqual({
      quantity: 2,
      rest: "cups flour",
    });
  });

  it("parses decimal quantities", () => {
    expect(parseQuantity("1.5 tsp salt")).toEqual({
      quantity: 1.5,
      rest: "tsp salt",
    });
  });

  it("parses fraction quantities", () => {
    expect(parseQuantity("1/2 cup sugar")).toEqual({
      quantity: 0.5,
      rest: "cup sugar",
    });
  });

  it("parses mixed number quantities", () => {
    expect(parseQuantity("1 1/2 cups milk")).toEqual({
      quantity: 1.5,
      rest: "cups milk",
    });
  });

  it("returns null for non-numeric ingredients", () => {
    expect(parseQuantity("salt to taste")).toEqual({
      quantity: null,
      rest: "salt to taste",
    });
  });

  it("handles ingredient with no rest", () => {
    expect(parseQuantity("3")).toEqual({
      quantity: 3,
      rest: "",
    });
  });
});

describe("scaleIngredient", () => {
  it("scales integer quantities", () => {
    expect(scaleIngredient("2 cups flour", 2)).toBe("4 cups flour");
  });

  it("scales decimal quantities", () => {
    expect(scaleIngredient("1.5 tsp salt", 2)).toBe("3 tsp salt");
  });

  it("scales fractions", () => {
    expect(scaleIngredient("1/2 cup sugar", 3)).toBe("1.5 cup sugar");
  });

  it("scales with fractional factor", () => {
    expect(scaleIngredient("4 cups rice", 0.5)).toBe("2 cups rice");
  });

  it("leaves non-numeric ingredients unchanged", () => {
    expect(scaleIngredient("salt to taste", 2)).toBe("salt to taste");
  });

  it("scales by factor 1 returns equivalent", () => {
    expect(scaleIngredient("2 cups flour", 1)).toBe("2 cups flour");
  });

  it("handles mixed numbers", () => {
    expect(scaleIngredient("1 1/2 cups milk", 2)).toBe("3 cups milk");
  });
});
