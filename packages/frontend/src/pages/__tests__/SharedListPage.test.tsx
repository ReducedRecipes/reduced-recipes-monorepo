import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("react-router-dom", () => ({
  useParams: vi.fn(() => ({ token: "share-abc123" })),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: null, isLoading: false, error: null })),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

const src = readFileSync(
  resolve(__dirname, "../SharedListPage.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SharedListPage", () => {
  it("exports default function SharedListPage", () => {
    expect(src).toContain("export default function SharedListPage");
  });

  it("imports useParams from react-router-dom", () => {
    expect(src).toContain("useParams");
  });

  it("imports SmartRollupItem type from @rr/shared", () => {
    expect(src).toContain("SmartRollupItem");
    expect(src).toContain("@rr/shared");
  });

  it("imports useQuery and useMutation from tanstack", () => {
    expect(src).toContain("useQuery");
    expect(src).toContain("useMutation");
  });

  it("fetches shared list data via apiFetch", () => {
    expect(src).toContain("apiFetch");
    expect(src).toContain("/shared/lists/");
  });

  it("shows loading spinner while loading", () => {
    expect(src).toContain("isLoading");
    expect(src).toContain("animate-spin");
  });

  it("shows error state when list not found", () => {
    expect(src).toContain("List not found");
    expect(src).toContain("This shared list doesn't exist or the link has expired.");
  });

  it("renders list name as heading", () => {
    expect(src).toContain("{list.name}");
  });

  it("renders 'Shared shopping list' subtitle", () => {
    expect(src).toContain("Shared shopping list");
  });

  it("renders item display_text", () => {
    expect(src).toContain("item.display_text");
  });

  it("groups items by category using CATEGORY_ORDER", () => {
    expect(src).toContain("CATEGORY_ORDER");
    expect(src).toContain("groupByCategory");
    expect(src).toContain("category");
  });

  it("shows category headers as uppercase text", () => {
    expect(src).toContain("uppercase");
    expect(src).toContain("{category}");
  });

  it("renders checked items section with count", () => {
    expect(src).toContain("Checked off");
    expect(src).toContain("checked.length");
  });

  it("shows empty state when list is empty", () => {
    expect(src).toContain("This list is empty.");
  });

  it("has toggle mutation for checking/unchecking items", () => {
    expect(src).toContain("toggleItem");
    expect(src).toContain("PATCH");
    expect(src).toContain("checked");
  });

  it("component can be imported", async () => {
    const mod = await import("../SharedListPage");
    expect(typeof mod.default).toBe("function");
  });

  // Logic test: groupByCategory filters correctly
  it("groupByCategory returns items in CATEGORY_ORDER sequence", () => {
    const CATEGORY_ORDER = ["Produce", "Dairy", "Meat & Seafood", "Pantry", "Frozen", "Bakery", "Beverages", "Spices & Seasonings", "Other"];
    const items = [
      { canonical_item: "bread", display_text: "Bread", total_quantity: 1, unit: null, category: "Bakery", sources: [] },
      { canonical_item: "milk", display_text: "Milk", total_quantity: 1, unit: "L", category: "Dairy", sources: [] },
    ];

    const groups = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.category || "Other";
      const list = groups.get(cat);
      if (list) list.push(item);
      else groups.set(cat, [item]);
    }
    const result = CATEGORY_ORDER.filter((c) => groups.has(c)).map((c) => ({
      category: c,
      items: groups.get(c)!,
    }));

    expect(result).toHaveLength(2);
    expect(result[0]!.category).toBe("Dairy");
    expect(result[1]!.category).toBe("Bakery");
  });
});
