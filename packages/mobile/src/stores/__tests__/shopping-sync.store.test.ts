import { describe, it, expect, beforeEach, vi } from "vitest";
import { useShoppingSyncStore } from "../shopping-sync.store";

vi.mock("../../lib/api", () => ({
  syncShoppingListItems: vi.fn().mockResolvedValue({ results: [] }),
  fetchShoppingLists: vi.fn().mockResolvedValue({ items: [] }),
  createShoppingList: vi.fn().mockResolvedValue({ id: "list-1", name: "Test" }),
  getShoppingList: vi.fn().mockResolvedValue({ list: { id: "list-1" }, items: [] }),
  addShoppingListItem: vi.fn().mockResolvedValue({}),
  updateShoppingListItem: vi.fn().mockResolvedValue({}),
  deleteShoppingListItem: vi.fn().mockResolvedValue(undefined),
  uncheckAllShoppingListItems: vi.fn().mockResolvedValue(undefined),
}));

function resetStore() {
  useShoppingSyncStore.setState({
    pendingMutations: [],
    lastSyncTimestamp: null,
    isSyncing: false,
    retryCount: 0,
  });
}

describe("shopping-sync.store", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  describe("enqueue", () => {
    it("adds a mutation with client_timestamp", () => {
      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });

      const { pendingMutations } = useShoppingSyncStore.getState();
      expect(pendingMutations).toHaveLength(1);
      expect(pendingMutations[0]!.type).toBe("check_item");
      expect(pendingMutations[0]!.item_id).toBe("item-1");
      expect(pendingMutations[0]!.client_timestamp).toBeDefined();
    });

    it("appends multiple mutations in order", () => {
      const store = useShoppingSyncStore.getState();
      store.enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });
      store.enqueue({
        shopping_list_id: "list-1",
        type: "add_item",
        text: "milk",
      });
      store.enqueue({
        shopping_list_id: "list-1",
        type: "remove_item",
        item_id: "item-2",
      });

      const { pendingMutations } = useShoppingSyncStore.getState();
      expect(pendingMutations).toHaveLength(3);
      expect(pendingMutations[0]!.type).toBe("check_item");
      expect(pendingMutations[1]!.type).toBe("add_item");
      expect(pendingMutations[2]!.type).toBe("remove_item");
    });
  });

  describe("sync", () => {
    it("does nothing when no pending mutations", async () => {
      const results = await useShoppingSyncStore.getState().sync();
      expect(results).toEqual([]);
    });

    it("does nothing when already syncing", async () => {
      useShoppingSyncStore.setState({ isSyncing: true });
      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });

      // Reset isSyncing to let enqueue work, then set it back
      useShoppingSyncStore.setState({ isSyncing: true });

      const results = await useShoppingSyncStore.getState().sync();
      expect(results).toEqual([]);
    });

    it("calls syncShoppingListItems and clears pending on success", async () => {
      const { syncShoppingListItems } = await import("../../lib/api");
      (syncShoppingListItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [{ item_id: "item-1", status: "applied" }],
      });

      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });

      const results = await useShoppingSyncStore.getState().sync();

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("applied");
      expect(useShoppingSyncStore.getState().pendingMutations).toHaveLength(0);
      expect(useShoppingSyncStore.getState().lastSyncTimestamp).toBeDefined();
      expect(useShoppingSyncStore.getState().retryCount).toBe(0);
    });

    it("groups mutations by shopping_list_id", async () => {
      const { syncShoppingListItems } = await import("../../lib/api");
      const mockSync = syncShoppingListItems as ReturnType<typeof vi.fn>;
      mockSync.mockResolvedValue({ results: [{ status: "applied" }] });

      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });
      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-2",
        type: "add_item",
        text: "eggs",
      });

      await useShoppingSyncStore.getState().sync();

      expect(mockSync).toHaveBeenCalledTimes(2);
      expect(mockSync).toHaveBeenCalledWith(
        "list-1",
        expect.arrayContaining([expect.objectContaining({ type: "check_item" })]),
      );
      expect(mockSync).toHaveBeenCalledWith(
        "list-2",
        expect.arrayContaining([expect.objectContaining({ type: "add_item" })]),
      );
    });

    it("increments retryCount on failure", async () => {
      const { syncShoppingListItems } = await import("../../lib/api");
      (syncShoppingListItems as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("Network error"),
      );

      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });

      await expect(useShoppingSyncStore.getState().sync()).rejects.toThrow("Network error");

      expect(useShoppingSyncStore.getState().retryCount).toBe(1);
      expect(useShoppingSyncStore.getState().isSyncing).toBe(false);
      // Mutations should still be pending
      expect(useShoppingSyncStore.getState().pendingMutations).toHaveLength(1);
    });

    it("logs warnings for conflict results", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { syncShoppingListItems } = await import("../../lib/api");
      (syncShoppingListItems as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [{ item_id: "item-1", status: "conflict" }],
      });

      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "check_item",
        item_id: "item-1",
        checked: true,
      });

      await useShoppingSyncStore.getState().sync();

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Conflict"),
      );
      warnSpy.mockRestore();
    });
  });

  describe("clearPending", () => {
    it("clears all pending mutations and resets retry count", () => {
      useShoppingSyncStore.getState().enqueue({
        shopping_list_id: "list-1",
        type: "add_item",
        text: "milk",
      });
      useShoppingSyncStore.setState({ retryCount: 3 });

      useShoppingSyncStore.getState().clearPending();

      expect(useShoppingSyncStore.getState().pendingMutations).toHaveLength(0);
      expect(useShoppingSyncStore.getState().retryCount).toBe(0);
    });
  });
});
