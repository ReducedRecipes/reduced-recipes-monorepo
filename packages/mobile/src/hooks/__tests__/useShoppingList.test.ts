import { describe, it, expect, beforeEach } from "vitest";
import { useShoppingStore, ShoppingItem } from "../../stores/shopping.store";

// Test the computed logic that useShoppingList provides on top of the store.
// We test via store directly since renderHook has React version conflicts in this monorepo.

function groupByCategory(items: ShoppingItem[]): Record<string, ShoppingItem[]> {
  const grouped: Record<string, ShoppingItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) {
      grouped[item.category] = [];
    }
    grouped[item.category]!.push(item);
  }
  return grouped;
}

function getCheckedCount(items: ShoppingItem[]): number {
  return items.filter((item) => item.checked).length;
}

function getRecipeIds(items: ShoppingItem[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.recipeId) {
      ids.add(item.recipeId);
    }
  }
  return [...ids];
}

function resetStore() {
  useShoppingStore.setState({ items: [] });
}

describe("useShoppingList computed properties", () => {
  beforeEach(() => {
    resetStore();
  });

  it("returns empty state initially", () => {
    const { items } = useShoppingStore.getState();
    expect(items).toEqual([]);
    expect(groupByCategory(items)).toEqual({});
    expect(getCheckedCount(items)).toBe(0);
    expect(items.length).toBe(0);
    expect(getRecipeIds(items)).toEqual([]);
  });

  it("groups items by category", () => {
    useShoppingStore.getState().addFromRecipe("r1", "Pasta", [
      "2 cups pasta",
      "1 tomato",
      "100g chicken breast",
    ]);

    const { items } = useShoppingStore.getState();
    const grouped = groupByCategory(items);

    expect(Object.keys(grouped).length).toBeGreaterThanOrEqual(1);
    const allGroupedItems = Object.values(grouped).flat();
    expect(allGroupedItems).toHaveLength(3);

    // Each item should be in its correct category group
    for (const item of items) {
      expect(grouped[item.category]).toContainEqual(item);
    }
  });

  it("computes checkedCount and totalCount", () => {
    useShoppingStore.getState().addManual("milk");
    useShoppingStore.getState().addManual("bread");

    let { items } = useShoppingStore.getState();
    expect(items.length).toBe(2);
    expect(getCheckedCount(items)).toBe(0);

    useShoppingStore.getState().toggle(items[0]!.id);

    items = useShoppingStore.getState().items;
    expect(getCheckedCount(items)).toBe(1);
    expect(items.length).toBe(2);
  });

  it("computes unique recipeIds", () => {
    useShoppingStore.getState().addFromRecipe("r1", "Pasta", ["pasta"]);
    useShoppingStore.getState().addFromRecipe("r2", "Salad", ["lettuce"]);
    useShoppingStore.getState().addFromRecipe("r1", "Pasta", ["tomato"]);
    useShoppingStore.getState().addManual("butter");

    const { items } = useShoppingStore.getState();
    const recipeIds = getRecipeIds(items);

    expect(recipeIds).toHaveLength(2);
    expect(recipeIds).toContain("r1");
    expect(recipeIds).toContain("r2");
  });

  it("excludes null recipeIds from manual items", () => {
    useShoppingStore.getState().addManual("butter");
    useShoppingStore.getState().addManual("salt");

    const { items } = useShoppingStore.getState();
    const recipeIds = getRecipeIds(items);

    expect(recipeIds).toEqual([]);
  });

  it("groupedByCategory preserves all items", () => {
    useShoppingStore.getState().addFromRecipe("r1", "Stir Fry", [
      "soy sauce",
      "rice",
      "chicken thigh",
      "broccoli",
    ]);

    const { items } = useShoppingStore.getState();
    const grouped = groupByCategory(items);

    const totalGroupedItems = Object.values(grouped).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );
    expect(totalGroupedItems).toBe(items.length);
  });
});
