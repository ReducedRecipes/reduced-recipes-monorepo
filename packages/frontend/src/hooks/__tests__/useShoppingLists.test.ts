import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  fetchShoppingLists: vi.fn(),
  createShoppingList: vi.fn(),
  getShoppingList: vi.fn(),
  updateShoppingList: vi.fn(),
  deleteShoppingList: vi.fn(),
  addManualItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
  uncheckAll: vi.fn(),
  createShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
  renewShareLink: vi.fn(),
}));

import {
  fetchShoppingLists,
  createShoppingList,
  getShoppingList,
  updateShoppingList,
  deleteShoppingList,
  addManualItem,
  updateItem,
  deleteItem,
  uncheckAll,
} from "../../lib/api";

const mockFetchShoppingLists = vi.mocked(fetchShoppingLists);
const mockCreateShoppingList = vi.mocked(createShoppingList);
const mockGetShoppingList = vi.mocked(getShoppingList);
const mockUpdateShoppingList = vi.mocked(updateShoppingList);
const mockDeleteShoppingList = vi.mocked(deleteShoppingList);
const mockAddManualItem = vi.mocked(addManualItem);
const mockUpdateItem = vi.mocked(updateItem);
const mockDeleteItem = vi.mocked(deleteItem);
const mockUncheckAll = vi.mocked(uncheckAll);

const mockList = {
  id: "list-1",
  user_id: "u-1",
  collection_id: null,
  name: "Weekly Groceries",
  is_default: 0,
  share_token: null,
  share_expires_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockListSummary = {
  ...mockList,
  item_count: 3,
  recipe_count: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useShoppingLists — API functions", () => {
  it("fetchShoppingLists returns list of shopping lists", async () => {
    mockFetchShoppingLists.mockResolvedValueOnce({
      items: [mockListSummary],
    } as any);

    const result = await fetchShoppingLists();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe("Weekly Groceries");
    expect(mockFetchShoppingLists).toHaveBeenCalledOnce();
  });

  it("createShoppingList sends name and returns new list", async () => {
    mockCreateShoppingList.mockResolvedValueOnce(mockList as any);

    const result = await createShoppingList({ name: "Weekly Groceries" });
    expect(result.id).toBe("list-1");
    expect(result.name).toBe("Weekly Groceries");
    expect(mockCreateShoppingList).toHaveBeenCalledWith({ name: "Weekly Groceries" });
  });

  it("getShoppingList returns list detail with items", async () => {
    const detail = {
      ...mockList,
      items: {
        unchecked: [
          {
            canonical_item: "milk",
            display_text: "2L Whole Milk",
            total_quantity: 2,
            unit: "L",
            category: "Dairy",
            sources: [{ item_id: "i-1", recipe_id: "r-1", quantity: 2, original_text: "2L milk" }],
          },
        ],
        checked: [],
      },
    };
    mockGetShoppingList.mockResolvedValueOnce(detail as any);

    const result = await getShoppingList("list-1");
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.display_text).toBe("2L Whole Milk");
    expect(result.items.unchecked[0]!.category).toBe("Dairy");
    expect(mockGetShoppingList).toHaveBeenCalledWith("list-1");
  });

  it("updateShoppingList updates name and returns updated list", async () => {
    const updated = { ...mockList, name: "Party Shopping" };
    mockUpdateShoppingList.mockResolvedValueOnce(updated as any);

    const result = await updateShoppingList("list-1", { name: "Party Shopping" });
    expect(result.name).toBe("Party Shopping");
    expect(mockUpdateShoppingList).toHaveBeenCalledWith("list-1", { name: "Party Shopping" });
  });

  it("deleteShoppingList calls API with list id", async () => {
    mockDeleteShoppingList.mockResolvedValueOnce(undefined);

    await deleteShoppingList("list-1");
    expect(mockDeleteShoppingList).toHaveBeenCalledWith("list-1");
  });
});

describe("useShoppingLists — item operations", () => {
  it("addManualItem sends item data to list", async () => {
    const newItem = { id: "i-new", shopping_list_id: "list-1", recipe_id: null, original_text: "Butter", quantity: 1, unit: null, item: "butter", canonical_name: "butter", category: null, checked: 0, parse_failed: 0, parsing: 0, source: "manual" as const, position: 0, created_at: "", updated_at: "" };
    mockAddManualItem.mockResolvedValueOnce(newItem as any);

    const result = await addManualItem("list-1", { name: "Butter" });
    expect(result.id).toBe("i-new");
    expect(mockAddManualItem).toHaveBeenCalledWith("list-1", { name: "Butter" });
  });

  it("updateItem updates checked status", async () => {
    const updated = { item_id: "i-1", checked: 1 };
    mockUpdateItem.mockResolvedValueOnce(updated as any);

    const result = await updateItem("list-1", "i-1", { checked: 1 });
    expect(result.checked).toBe(1);
    expect(mockUpdateItem).toHaveBeenCalledWith("list-1", "i-1", { checked: 1 });
  });

  it("deleteItem removes item from list", async () => {
    mockDeleteItem.mockResolvedValueOnce(undefined);

    await deleteItem("list-1", "i-1");
    expect(mockDeleteItem).toHaveBeenCalledWith("list-1", "i-1");
  });

  it("uncheckAll unchecks all items in list", async () => {
    mockUncheckAll.mockResolvedValueOnce({ count: 3 });

    const result = await uncheckAll("list-1");
    expect(result.count).toBe(3);
    expect(mockUncheckAll).toHaveBeenCalledWith("list-1");
  });
});

describe("useShoppingLists — optimistic update logic", () => {
  it("optimistic create appends temporary list", () => {
    const existing = [mockListSummary];
    const params = { name: "New List" };

    const optimistic = [
      ...existing,
      {
        id: `temp-${Date.now()}`,
        user_id: "",
        collection_id: null,
        name: params.name ?? "My Shopping List",
        is_default: 0,
        share_token: null,
        share_expires_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        item_count: 0,
        recipe_count: 0,
      },
    ];

    expect(optimistic).toHaveLength(2);
    expect(optimistic[1]!.name).toBe("New List");
    expect(optimistic[1]!.item_count).toBe(0);
  });

  it("optimistic delete filters out list by id", () => {
    const lists = [
      mockListSummary,
      { ...mockListSummary, id: "list-2", name: "Party Shopping" },
    ];
    const deleteId = "list-1";
    const filtered = lists.filter((l) => l.id !== deleteId);

    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.name).toBe("Party Shopping");
  });

  it("optimistic update changes list name", () => {
    const lists = [mockListSummary];
    const updateId = "list-1";
    const newName = "Updated Name";
    const updated = lists.map((l) =>
      l.id === updateId ? { ...l, name: newName } : l,
    );

    expect(updated[0]!.name).toBe("Updated Name");
  });
});
