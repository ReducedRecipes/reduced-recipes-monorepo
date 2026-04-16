import { describe, it, expect, beforeEach } from "vitest";
import { useShoppingStore } from "../shopping.store";

function resetStore() {
  useShoppingStore.setState({ items: [] });
}

describe("shopping.store", () => {
  beforeEach(() => {
    resetStore();
  });

  describe("addFromRecipe", () => {
    it("adds items with auto-categorisation from recipe ingredients", () => {
      useShoppingStore
        .getState()
        .addFromRecipe("r1", "Pasta Salad", [
          "2 cups pasta",
          "1 tomato",
          "100g chicken breast",
        ]);

      const { items } = useShoppingStore.getState();
      expect(items).toHaveLength(3);
      expect(items[0]!.text).toBe("2 cups pasta");
      expect(items[0]!.category).toBe("Pantry");
      expect(items[0]!.recipeId).toBe("r1");
      expect(items[0]!.recipeTitle).toBe("Pasta Salad");
      expect(items[0]!.checked).toBe(false);

      expect(items[1]!.text).toBe("1 tomato");
      expect(items[1]!.category).toBe("Produce");

      expect(items[2]!.text).toBe("100g chicken breast");
      expect(items[2]!.category).toBe("Meat");
    });

    it("assigns unique ids to each item", () => {
      useShoppingStore
        .getState()
        .addFromRecipe("r1", "Test", ["salt", "pepper"]);

      const { items } = useShoppingStore.getState();
      expect(items[0]!.id).not.toBe(items[1]!.id);
    });
  });

  describe("addManual", () => {
    it("adds a manual item with auto-categorisation", () => {
      useShoppingStore.getState().addManual("milk");

      const { items } = useShoppingStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0]!.text).toBe("milk");
      expect(items[0]!.category).toBe("Dairy");
      expect(items[0]!.recipeId).toBeNull();
      expect(items[0]!.recipeTitle).toBeNull();
      expect(items[0]!.checked).toBe(false);
    });

    it("categorises unknown items as Other", () => {
      useShoppingStore.getState().addManual("exotic spice mix");

      const { items } = useShoppingStore.getState();
      expect(items[0]!.category).toBe("Other");
    });
  });

  describe("toggle", () => {
    it("flips checked boolean for the target item", () => {
      useShoppingStore.getState().addManual("butter");
      const id = useShoppingStore.getState().items[0]!.id;

      useShoppingStore.getState().toggle(id);
      expect(useShoppingStore.getState().items[0]!.checked).toBe(true);

      useShoppingStore.getState().toggle(id);
      expect(useShoppingStore.getState().items[0]!.checked).toBe(false);
    });

    it("does not affect other items", () => {
      useShoppingStore.getState().addManual("butter");
      useShoppingStore.getState().addManual("flour");
      const id = useShoppingStore.getState().items[0]!.id;

      useShoppingStore.getState().toggle(id);
      expect(useShoppingStore.getState().items[1]!.checked).toBe(false);
    });
  });

  describe("clearChecked", () => {
    it("removes only checked items", () => {
      useShoppingStore.getState().addManual("butter");
      useShoppingStore.getState().addManual("flour");
      useShoppingStore.getState().addManual("sugar");

      const items = useShoppingStore.getState().items;
      useShoppingStore.getState().toggle(items[0]!.id);
      useShoppingStore.getState().toggle(items[2]!.id);

      useShoppingStore.getState().clearChecked();

      const remaining = useShoppingStore.getState().items;
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.text).toBe("flour");
    });
  });

  describe("clearAll", () => {
    it("removes all items", () => {
      useShoppingStore.getState().addManual("butter");
      useShoppingStore.getState().addManual("flour");

      useShoppingStore.getState().clearAll();

      expect(useShoppingStore.getState().items).toHaveLength(0);
    });
  });

  describe("remove", () => {
    it("removes a specific item by id", () => {
      useShoppingStore.getState().addManual("butter");
      useShoppingStore.getState().addManual("flour");
      const id = useShoppingStore.getState().items[0]!.id;

      useShoppingStore.getState().remove(id);

      const { items } = useShoppingStore.getState();
      expect(items).toHaveLength(1);
      expect(items[0]!.text).toBe("flour");
    });
  });
});
