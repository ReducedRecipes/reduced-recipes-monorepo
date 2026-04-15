import { describe, it, expect } from "vitest";
import { categoriseIngredient } from "../categorise";

describe("categoriseIngredient", () => {
  describe("Produce", () => {
    it.each([
      ["2 large carrots, diced", "Produce"],
      ["fresh spinach leaves", "Produce"],
      ["1 red onion", "Produce"],
      ["minced garlic", "Produce"],
      ["baby kale", "Produce"],
      ["diced tomato", "Produce"],
      ["sliced mushroom", "Produce"],
      ["1 zucchini", "Produce"],
    ])("classifies '%s' as %s", (ingredient, expected) => {
      expect(categoriseIngredient(ingredient)).toBe(expected);
    });
  });

  describe("Dairy", () => {
    it.each([
      ["1 cup whole milk", "Dairy"],
      ["shredded cheddar cheese", "Dairy"],
      ["2 large eggs", "Dairy"],
      ["unsalted butter", "Dairy"],
      ["Greek yogurt", "Dairy"],
      ["grated parmesan", "Dairy"],
      ["heavy cream", "Dairy"],
    ])("classifies '%s' as %s", (ingredient, expected) => {
      expect(categoriseIngredient(ingredient)).toBe(expected);
    });
  });

  describe("Meat", () => {
    it.each([
      ["boneless chicken breast", "Meat"],
      ["1 lb ground beef", "Meat"],
      ["thick-cut bacon", "Meat"],
      ["wild-caught salmon fillet", "Meat"],
      ["large shrimp, peeled", "Meat"],
      ["sliced turkey deli meat", "Meat"],
      ["pork tenderloin", "Meat"],
    ])("classifies '%s' as %s", (ingredient, expected) => {
      expect(categoriseIngredient(ingredient)).toBe(expected);
    });
  });

  describe("Pantry", () => {
    it.each([
      ["2 cups all-purpose flour", "Pantry"],
      ["extra virgin olive oil", "Pantry"],
      ["long grain rice", "Pantry"],
      ["low-sodium soy sauce", "Pantry"],
      ["1 tbsp honey", "Pantry"],
      ["penne pasta", "Pantry"],
      ["canned tomato", "Pantry"],
      ["white vinegar", "Pantry"],
    ])("classifies '%s' as %s", (ingredient, expected) => {
      expect(categoriseIngredient(ingredient)).toBe(expected);
    });
  });

  describe("Spices", () => {
    it.each([
      ["1 tsp ground cumin", "Spices"],
      ["smoked paprika", "Spices"],
      ["dried oregano", "Spices"],
      ["ground cinnamon", "Spices"],
      ["kosher salt", "Spices"],
      ["freshly ground black pepper", "Spices"],
      ["garam masala", "Spices"],
      ["dried thyme", "Spices"],
    ])("classifies '%s' as %s", (ingredient, expected) => {
      expect(categoriseIngredient(ingredient)).toBe(expected);
    });
  });

  describe("Other (fallback)", () => {
    it.each([
      ["xanthan gum"],
      ["liquid smoke"],
      ["nutritional yeast"],
      ["tofu"],
    ])("classifies '%s' as Other", (ingredient) => {
      expect(categoriseIngredient(ingredient)).toBe("Other");
    });
  });

  describe("case-insensitive matching", () => {
    it("handles uppercase input", () => {
      expect(categoriseIngredient("FRESH SPINACH")).toBe("Produce");
    });

    it("handles mixed case input", () => {
      expect(categoriseIngredient("Smoked Paprika")).toBe("Spices");
    });

    it("handles all-caps with extra spaces", () => {
      expect(categoriseIngredient("  OLIVE OIL  ")).toBe("Pantry");
    });
  });
});
