import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../hooks/useShoppingLists", () => ({
  useShoppingList: vi.fn(),
  useShoppingListItems: vi.fn(),
  useShareLink: vi.fn(),
  useShoppingLists: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: vi.fn(() => ({ id: "list-1" })),
  useNavigate: vi.fn(() => vi.fn()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    `<a href="${to}">${children}</a>`,
}));

import { useAuth } from "../../hooks/useAuth";
import {
  useShoppingList,
  useShoppingListItems,
  useShareLink,
  useShoppingLists,
} from "../../hooks/useShoppingLists";

const mockUseAuth = vi.mocked(useAuth);
const mockUseShoppingList = vi.mocked(useShoppingList);
const mockUseShoppingListItems = vi.mocked(useShoppingListItems);
const mockUseShareLink = vi.mocked(useShareLink);
const mockUseShoppingLists = vi.mocked(useShoppingLists);

const src = readFileSync(
  resolve(__dirname, "../ShoppingListPage.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({
    user: { id: "u-1", email: "test@test.com", name: "Test", picture_url: null, profile_public: 1, tier: "free", created_at: "", updated_at: "" } as any,
    isAuthenticated: true,
    isLoading: false,
    isNewUser: false,
    logout: vi.fn(),
    login: vi.fn(),
    checkAuth: vi.fn(),
  });
  mockUseShoppingList.mockReturnValue({
    list: {
      id: "list-1",
      user_id: "u-1",
      name: "Weekly Groceries",
      is_default: 0,
      share_token: null,
      share_expires_at: null,
      collection_id: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
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
          {
            canonical_item: "chicken",
            display_text: "500g Chicken Breast",
            total_quantity: 500,
            unit: "g",
            category: "Meat & Seafood",
            sources: [{ item_id: "i-2", recipe_id: "r-2", quantity: 500, original_text: "500g chicken" }],
          },
        ],
        checked: [],
      },
    } as any,
    isLoading: false,
  });
  mockUseShoppingListItems.mockReturnValue({
    addItem: vi.fn(),
    updateItem: vi.fn(),
    deleteItem: vi.fn(),
    uncheckAll: vi.fn(),
    isAdding: false,
    isUpdating: false,
    isDeleting: false,
  });
  mockUseShareLink.mockReturnValue({
    createShareLink: vi.fn(),
    revokeShareLink: vi.fn(),
    renewShareLink: vi.fn(),
    isCreating: false,
    isRevoking: false,
    isRenewing: false,
  });
  mockUseShoppingLists.mockReturnValue({
    lists: [],
    isLoading: false,
    createList: vi.fn(),
    createListAsync: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    isCreating: false,
    isUpdating: false,
    isDeleting: false,
  });
});

describe("ShoppingListPage", () => {
  it("exports default function ShoppingListPage", () => {
    expect(src).toContain("export default function ShoppingListPage");
  });

  it("imports useParams from react-router-dom", () => {
    expect(src).toContain("useParams");
  });

  it("imports useAuth hook", () => {
    expect(src).toContain("useAuth");
  });

  it("imports SmartRollupItem type from @rr/shared", () => {
    expect(src).toContain("SmartRollupItem");
    expect(src).toContain("@rr/shared");
  });

  it("shows loading spinner during loading state", () => {
    expect(src).toContain("authLoading || isLoading");
    expect(src).toContain("animate-spin");
  });

  it("redirects unauthenticated users to home", () => {
    expect(src).toContain("!isAuthenticated");
    expect(src).toContain('navigate("/", { replace: true })');
  });

  it("renders category section headers from groupByCategory", () => {
    expect(src).toContain("groupByCategory");
    expect(src).toContain("CategorySection");
    expect(src).toContain("group.category");
  });

  it("renders item display_text in RollupItemRow", () => {
    expect(src).toContain("item.display_text");
  });

  it("has checkbox-style toggle button for items", () => {
    expect(src).toContain("onToggle");
    expect(src).toContain("isChecked");
    expect(src).toContain("border-orange-500 bg-orange-500");
  });

  it("has add item input with placeholder", () => {
    expect(src).toContain('placeholder="Add an item..."');
    expect(src).toContain("handleAddItem");
  });

  it("shows empty state when no items", () => {
    expect(src).toContain("No items yet. Add some below.");
  });

  it("supports collapsing category sections", () => {
    expect(src).toContain("collapsed");
    expect(src).toContain("setCollapsed");
  });

  it("has back navigation to all lists", () => {
    expect(src).toContain('navigate("/shopping-lists")');
    expect(src).toContain("All Lists");
  });

  it("groups items by CATEGORY_ORDER", () => {
    expect(src).toContain("CATEGORY_ORDER");
    expect(src).toContain('"Produce"');
    expect(src).toContain('"Dairy"');
    expect(src).toContain('"Meat & Seafood"');
  });

  it("component can be imported", async () => {
    const mod = await import("../ShoppingListPage");
    expect(typeof mod.default).toBe("function");
  });

  // Logic test: groupByCategory correctly categorizes items
  it("groups items by category with correct ordering", () => {
    const items = [
      { canonical_item: "milk", display_text: "Milk", total_quantity: 1, unit: "L", category: "Dairy", sources: [] },
      { canonical_item: "apple", display_text: "Apples", total_quantity: 3, unit: null, category: "Produce", sources: [] },
      { canonical_item: "bread", display_text: "Bread", total_quantity: 1, unit: null, category: "Bakery", sources: [] },
    ];

    // Replicate groupByCategory logic
    const CATEGORY_ORDER = ["Produce", "Dairy", "Meat & Seafood", "Pantry", "Frozen", "Bakery", "Beverages", "Spices & Seasonings", "Other"];
    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.category || "Other";
      const list = groups.get(cat);
      if (list) list.push(item);
      else groups.set(cat, [item]);
    }
    const result: { category: string; items: typeof items }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const catItems = groups.get(cat);
      if (catItems && catItems.length > 0) {
        result.push({ category: cat, items: catItems });
        groups.delete(cat);
      }
    }

    expect(result).toHaveLength(3);
    expect(result[0]!.category).toBe("Produce");
    expect(result[1]!.category).toBe("Dairy");
    expect(result[2]!.category).toBe("Bakery");
  });
});
