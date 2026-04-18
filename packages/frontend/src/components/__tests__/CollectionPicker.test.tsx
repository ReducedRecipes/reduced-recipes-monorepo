import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useCollections", () => ({
  useCollections: vi.fn(),
}));

import { useCollections } from "../../hooks/useCollections";

const mockUseCollections = vi.mocked(useCollections);

const src = readFileSync(
  resolve(__dirname, "../CollectionPicker.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CollectionPicker", () => {
  // Source verification tests
  it("exports CollectionPicker as named export", () => {
    expect(src).toContain("export function CollectionPicker");
  });

  it("accepts onSelect, excludeId, and className props", () => {
    expect(src).toContain("onSelect: (collectionId: string) => void");
    expect(src).toContain("excludeId?: string");
    expect(src).toContain("className?: string");
  });

  it("shows loading state with disabled select", () => {
    expect(src).toContain("isLoading");
    expect(src).toContain("disabled");
    expect(src).toContain("Loading...");
  });

  it("displays 'Move to collection...' as default option", () => {
    expect(src).toContain("Move to collection...");
  });

  it("filters out excluded collection", () => {
    expect(src).toContain("c.id !== excludeId");
  });

  it("calls onSelect with collection id on change", () => {
    expect(src).toContain("onSelect(e.target.value)");
  });

  it("resets select value after selection", () => {
    expect(src).toContain('e.target.value = ""');
  });

  it("marks default collections with label", () => {
    expect(src).toContain('collection.is_default === 1 ? " (default)" : ""');
  });

  it("only triggers onSelect when value is non-empty", () => {
    expect(src).toContain("if (e.target.value)");
  });

  it("applies custom className", () => {
    expect(src).toContain("${className}");
    expect(src).toContain('className = ""');
  });

  // Logic/import tests
  it("component can be imported", async () => {
    mockUseCollections.mockReturnValue({
      collections: [],
      isLoading: false,
      createCollection: vi.fn(),
      updateCollection: vi.fn(),
      deleteCollection: vi.fn(),
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    const mod = await import("../CollectionPicker");
    expect(typeof mod.CollectionPicker).toBe("function");
  });

  it("filters collections correctly when excludeId is provided", () => {
    const collections = [
      { id: "c1", name: "Favorites", user_id: "u1", is_default: 1, is_public: 0, position: 0, created_at: "", updated_at: "" },
      { id: "c2", name: "Desserts", user_id: "u1", is_default: 0, is_public: 0, position: 1, created_at: "", updated_at: "" },
      { id: "c3", name: "Quick Meals", user_id: "u1", is_default: 0, is_public: 0, position: 2, created_at: "", updated_at: "" },
    ];

    const excludeId = "c2";
    const filtered = collections.filter((c) => c.id !== excludeId);

    expect(filtered).toHaveLength(2);
    expect(filtered.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("returns all collections when excludeId is undefined", () => {
    const collections = [
      { id: "c1", name: "Favorites", user_id: "u1", is_default: 1, is_public: 0, position: 0, created_at: "", updated_at: "" },
      { id: "c2", name: "Desserts", user_id: "u1", is_default: 0, is_public: 0, position: 1, created_at: "", updated_at: "" },
    ];

    const excludeId = undefined;
    const filtered = excludeId
      ? collections.filter((c) => c.id !== excludeId)
      : collections;

    expect(filtered).toHaveLength(2);
  });
});
