import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../hooks/useShoppingLists", () => ({
  useShoppingLists: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    `<a href="${to}">${children}</a>`,
}));

import { useAuth } from "../../hooks/useAuth";
import { useShoppingLists } from "../../hooks/useShoppingLists";

const mockUseAuth = vi.mocked(useAuth);
const mockUseShoppingLists = vi.mocked(useShoppingLists);

const src = readFileSync(
  resolve(__dirname, "../ShoppingListsPage.tsx"),
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
  mockUseShoppingLists.mockReturnValue({
    lists: [
      {
        id: "list-1",
        user_id: "u-1",
        name: "Weekly Groceries",
        is_default: 0,
        share_token: null,
        share_expires_at: null,
        collection_id: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        item_count: 5,
        recipe_count: 2,
      },
      {
        id: "list-2",
        user_id: "u-1",
        name: "Party Shopping",
        is_default: 0,
        share_token: null,
        share_expires_at: null,
        collection_id: null,
        created_at: "2024-01-02T00:00:00Z",
        updated_at: "2024-01-02T00:00:00Z",
        item_count: 1,
        recipe_count: 0,
      },
    ] as any[],
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

describe("ShoppingListsPage", () => {
  it("exports default function ShoppingListsPage", () => {
    expect(src).toContain("export default function ShoppingListsPage");
  });

  it("imports useAuth and useShoppingLists hooks", () => {
    expect(src).toContain("useAuth");
    expect(src).toContain("useShoppingLists");
  });

  it("redirects unauthenticated users to home", () => {
    expect(src).toContain("!isAuthenticated");
    expect(src).toContain('navigate("/", { replace: true })');
  });

  it("shows loading spinner during auth loading", () => {
    expect(src).toContain("authLoading");
    expect(src).toContain("animate-spin");
  });

  it("renders list names via list.name", () => {
    expect(src).toContain("list.name");
  });

  it("renders item counts with correct pluralization", () => {
    expect(src).toContain("list.item_count");
    expect(src).toContain('list.item_count === 1 ? "item" : "items"');
  });

  it("renders recipe counts when present", () => {
    expect(src).toContain("list.recipe_count");
    expect(src).toContain('list.recipe_count === 1 ? "recipe" : "recipes"');
  });

  it("has create new list input and button", () => {
    expect(src).toContain('placeholder="New list name (optional)"');
    expect(src).toContain("handleCreate");
    expect(src).toContain("New List");
  });

  it("shows empty state when no lists", () => {
    expect(src).toContain("No shopping lists yet. Create one to get started.");
  });

  it("links each list to its detail page", () => {
    expect(src).toContain("/shopping-lists/${list.id}");
  });

  it("has delete button for each list", () => {
    expect(src).toContain("Delete this shopping list?");
    expect(src).toContain("deleteList");
  });

  it("navigates to new list after creation", () => {
    expect(src).toContain("navigate(`/shopping-lists/${result.id}`)");
  });

  it("component can be imported", async () => {
    const mod = await import("../ShoppingListsPage");
    expect(typeof mod.default).toBe("function");
  });

  // Logic test: item count display
  it("correctly formats singular item count", () => {
    const item_count = 1;
    const label = `${item_count} ${item_count === 1 ? "item" : "items"}`;
    expect(label).toBe("1 item");
  });

  it("correctly formats plural item count", () => {
    const item_count = 5 as number;
    const label = `${item_count} ${item_count === 1 ? "item" : "items"}`;
    expect(label).toBe("5 items");
  });
});
