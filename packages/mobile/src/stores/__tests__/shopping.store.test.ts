import { describe, it, expect, beforeEach, vi } from "vitest";
import { useShoppingStore } from "../shopping.store";
import { useShoppingSyncStore } from "../shopping-sync.store";

vi.mock("../../lib/api", () => ({
  fetchShoppingLists: vi.fn().mockResolvedValue({ items: [] }),
  createShoppingList: vi.fn().mockResolvedValue({ id: "list-1", name: "Test" }),
  getShoppingList: vi.fn().mockResolvedValue({ list: { id: "list-1" }, items: [] }),
  addShoppingListItem: vi.fn().mockResolvedValue({}),
  updateShoppingListItem: vi.fn().mockResolvedValue({}),
  deleteShoppingListItem: vi.fn().mockResolvedValue(undefined),
  uncheckAllShoppingListItems: vi.fn().mockResolvedValue(undefined),
  syncShoppingListItems: vi.fn().mockResolvedValue({ results: [] }),
}));

function resetStore() {
  useShoppingStore.setState({
    items: [],
    lists: [],
    serverItems: [],
    activeListId: null,
    isLoading: false,
    isOnline: false, // offline by default so server calls don't fire
  });
  useShoppingSyncStore.setState({
    pendingMutations: [],
    lastSyncTimestamp: null,
    isSyncing: false,
    retryCount: 0,
  });
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

  describe("uncheckAll", () => {
    it("unchecks all items", () => {
      useShoppingStore.getState().addManual("butter");
      useShoppingStore.getState().addManual("flour");
      const items = useShoppingStore.getState().items;
      useShoppingStore.getState().toggle(items[0]!.id);
      useShoppingStore.getState().toggle(items[1]!.id);

      useShoppingStore.getState().uncheckAll();

      const updated = useShoppingStore.getState().items;
      expect(updated.every((i) => !i.checked)).toBe(true);
    });
  });

  describe("online/offline", () => {
    it("setOnline updates isOnline state", () => {
      expect(useShoppingStore.getState().isOnline).toBe(false);
      useShoppingStore.getState().setOnline(true);
      expect(useShoppingStore.getState().isOnline).toBe(true);
    });

    it("fetchLists does nothing when offline", async () => {
      await useShoppingStore.getState().fetchLists();
      expect(useShoppingStore.getState().lists).toEqual([]);
      expect(useShoppingStore.getState().isLoading).toBe(false);
    });

    it("fetchLists populates lists when online", async () => {
      const { fetchShoppingLists } = await import("../../lib/api");
      (fetchShoppingLists as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        items: [{ id: "l1", name: "Groceries" }],
      });
      useShoppingStore.setState({ isOnline: true });

      await useShoppingStore.getState().fetchLists();

      expect(useShoppingStore.getState().lists).toEqual([
        { id: "l1", name: "Groceries" },
      ]);
    });

    it("selectList fetches rolled-up items from server when online", async () => {
      const { getShoppingList } = await import("../../lib/api");
      (getShoppingList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        list: { id: "l1" },
        items: {
          unchecked: [
            {
              canonical_item: "milk",
              display_text: "milk",
              total_quantity: null,
              unit: null,
              category: "Dairy",
              sources: [{ item_id: "item-1", recipe_id: null, quantity: null, original_text: "milk" }],
            },
          ],
          checked: [],
        },
      });
      useShoppingStore.setState({ isOnline: true });

      await useShoppingStore.getState().selectList("l1");

      expect(useShoppingStore.getState().activeListId).toBe("l1");
      expect(useShoppingStore.getState().items).toHaveLength(1);
      expect(useShoppingStore.getState().items[0]!.text).toBe("milk");
      expect(useShoppingStore.getState().items[0]!.checked).toBe(false);
      expect(useShoppingStore.getState().items[0]!.category).toBe("Dairy");
    });

    it("selectList uses backend category from rollup items", async () => {
      const { getShoppingList } = await import("../../lib/api");
      (getShoppingList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        list: { id: "l1" },
        items: {
          unchecked: [
            {
              canonical_item: "basil",
              display_text: "10 basil leaves",
              total_quantity: 10,
              unit: null,
              category: "Produce",
              sources: [{ item_id: "item-2", recipe_id: "r1", quantity: 10, original_text: "fresh basil leaves" }],
            },
          ],
          checked: [],
        },
      });
      useShoppingStore.setState({ isOnline: true });

      await useShoppingStore.getState().selectList("l1");

      const items = useShoppingStore.getState().items;
      expect(items[0]!.category).toBe("Produce");
    });

    it("selectList falls back to client-side categorisation when rollup category is empty", async () => {
      const { getShoppingList } = await import("../../lib/api");
      (getShoppingList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        list: { id: "l1" },
        items: {
          unchecked: [
            {
              canonical_item: "flour",
              display_text: "2 cups flour",
              total_quantity: 2,
              unit: "cups",
              category: "",
              sources: [{ item_id: "item-3", recipe_id: null, quantity: 2, original_text: "2 cups flour" }],
            },
          ],
          checked: [],
        },
      });
      useShoppingStore.setState({ isOnline: true });

      await useShoppingStore.getState().selectList("l1");

      const items = useShoppingStore.getState().items;
      expect(items[0]!.category).toBe("Pantry");
    });

    it("selectList maps checked rollup items correctly", async () => {
      const { getShoppingList } = await import("../../lib/api");
      (getShoppingList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        list: { id: "l1" },
        items: {
          unchecked: [],
          checked: [
            {
              canonical_item: "chicken breast",
              display_text: "1 lb chicken breast",
              total_quantity: 1,
              unit: "lb",
              category: "Meat & Seafood",
              sources: [{ item_id: "item-4", recipe_id: "r2", quantity: 1, original_text: "chicken breast" }],
            },
          ],
        },
      });
      useShoppingStore.setState({ isOnline: true });

      await useShoppingStore.getState().selectList("l1");

      const items = useShoppingStore.getState().items;
      expect(items[0]!.checked).toBe(true);
      expect(items[0]!.category).toBe("Meat & Seafood");
      expect(items[0]!.recipeId).toBe("r2");
    });

    it("selectList handles multi-source rollup items", async () => {
      const { getShoppingList } = await import("../../lib/api");
      (getShoppingList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        list: { id: "l1" },
        items: {
          unchecked: [
            {
              canonical_item: "onion",
              display_text: "3 onions",
              total_quantity: 3,
              unit: null,
              category: "Produce",
              sources: [
                { item_id: "item-5", recipe_id: "r1", quantity: 1, original_text: "1 onion" },
                { item_id: "item-6", recipe_id: "r2", quantity: 2, original_text: "2 onions" },
              ],
            },
          ],
          checked: [],
        },
      });
      useShoppingStore.setState({ isOnline: true });

      await useShoppingStore.getState().selectList("l1");

      const items = useShoppingStore.getState().items;
      expect(items).toHaveLength(1);
      expect(items[0]!.text).toBe("3 onions");
      expect(items[0]!.category).toBe("Produce");
      expect(items[0]!.id).toBe("item-5");
    });

    it("createList returns list when online", async () => {
      const { createShoppingList } = await import("../../lib/api");
      (createShoppingList as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "new-list",
        name: "Dinner",
      });
      useShoppingStore.setState({ isOnline: true });

      const result = await useShoppingStore.getState().createList("Dinner");

      expect(result).toEqual({ id: "new-list", name: "Dinner" });
      expect(useShoppingStore.getState().lists).toHaveLength(1);
    });

    it("createList returns null when offline", async () => {
      const result = await useShoppingStore.getState().createList("Dinner");
      expect(result).toBeNull();
    });

    it("addManual calls server when online with active list", async () => {
      const { addShoppingListItem } = await import("../../lib/api");
      useShoppingStore.setState({ isOnline: true, activeListId: "l1" });

      useShoppingStore.getState().addManual("eggs");

      expect(addShoppingListItem).toHaveBeenCalledWith("l1", { name: "eggs" });
    });

    it("addManual queues mutation when offline with active list", () => {
      useShoppingStore.setState({ isOnline: false, activeListId: "l1" });

      useShoppingStore.getState().addManual("eggs");

      const { pendingMutations } = useShoppingSyncStore.getState();
      expect(pendingMutations).toHaveLength(1);
      expect(pendingMutations[0]!.type).toBe("add_item");
      expect(pendingMutations[0]!.text).toBe("eggs");
      expect(pendingMutations[0]!.shopping_list_id).toBe("l1");
    });

    it("toggle queues check_item mutation when offline", () => {
      useShoppingStore.setState({ isOnline: false, activeListId: "l1" });
      useShoppingStore.getState().addManual("butter");
      const id = useShoppingStore.getState().items[0]!.id;

      // Clear the add_item mutation from addManual
      useShoppingSyncStore.setState({ pendingMutations: [] });

      useShoppingStore.getState().toggle(id);

      const { pendingMutations } = useShoppingSyncStore.getState();
      expect(pendingMutations).toHaveLength(1);
      expect(pendingMutations[0]!.type).toBe("check_item");
      expect(pendingMutations[0]!.item_id).toBe(id);
      expect(pendingMutations[0]!.checked).toBe(true);
    });

    it("remove queues remove_item mutation when offline", () => {
      useShoppingStore.setState({ isOnline: false, activeListId: "l1" });
      useShoppingStore.getState().addManual("butter");
      const id = useShoppingStore.getState().items[0]!.id;

      // Clear the add_item mutation from addManual
      useShoppingSyncStore.setState({ pendingMutations: [] });

      useShoppingStore.getState().remove(id);

      const { pendingMutations } = useShoppingSyncStore.getState();
      expect(pendingMutations).toHaveLength(1);
      expect(pendingMutations[0]!.type).toBe("remove_item");
      expect(pendingMutations[0]!.item_id).toBe(id);
    });
  });
});
