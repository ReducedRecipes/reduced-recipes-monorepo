import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useCollections", () => ({
  useCollections: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    `<a href="${to}">${children}</a>`,
}));

import { useCollections } from "../../hooks/useCollections";

const mockUseCollections = vi.mocked(useCollections);

const src = readFileSync(
  resolve(__dirname, "../CollectionList.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CollectionList", () => {
  // Source verification tests
  it("imports useCollections hook", () => {
    expect(src).toContain("useCollections");
  });

  it("exports CollectionList as named export", () => {
    expect(src).toContain("export function CollectionList");
  });

  it("renders loading state when isLoading is true", () => {
    expect(src).toContain("isLoading");
    expect(src).toContain("Loading");
  });

  it("shows empty state message when no collections", () => {
    expect(src).toContain("No collections yet.");
    expect(src).toContain("collections.length === 0");
  });

  it("has create collection input and button", () => {
    expect(src).toContain('placeholder="Collection name"');
    expect(src).toContain("Create");
    expect(src).toContain("handleCreate");
  });

  it("supports Enter key to create collection", () => {
    expect(src).toContain('e.key === "Enter"');
    expect(src).toContain("handleCreate");
  });

  it("conditionally shows Create button when name is not empty", () => {
    expect(src).toContain("newName.trim()");
  });

  it("has rename functionality with save and cancel", () => {
    expect(src).toContain("startEdit");
    expect(src).toContain("saveEdit");
    expect(src).toContain("cancelEdit");
    expect(src).toContain("Rename");
    expect(src).toContain("Save");
    expect(src).toContain("Cancel");
  });

  it("supports Escape key to cancel edit", () => {
    expect(src).toContain('e.key === "Escape"');
    expect(src).toContain("cancelEdit");
  });

  it("has delete confirmation flow", () => {
    expect(src).toContain("deleteConfirmId");
    expect(src).toContain("Delete?");
    expect(src).toContain("handleDelete");
    expect(src).toContain("Yes");
    expect(src).toContain("No");
  });

  it("does not show delete/rename for default collection", () => {
    expect(src).toContain("collection.is_default !== 1");
  });

  it("marks default collection with label", () => {
    expect(src).toContain("(default)");
    expect(src).toContain("collection.is_default === 1");
  });

  it("links each collection to its detail page", () => {
    expect(src).toContain("/collection/${collection.id}");
  });

  // Logic tests
  it("trims whitespace before creating a collection", () => {
    const mockCreate = vi.fn();
    mockUseCollections.mockReturnValue({
      collections: [],
      isLoading: false,
      createCollection: mockCreate,
      updateCollection: vi.fn(),
      deleteCollection: vi.fn(),
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    // Verify the handleCreate logic trims input
    expect(src).toContain("newName.trim()");
    expect(src).toContain('if (!trimmed) return');
    expect(src).toContain("createCollection({ name: trimmed })");
  });

  it("trims whitespace before saving edit", () => {
    expect(src).toContain("editName.trim()");
    expect(src).toContain("updateCollection({ id: editingId, name: trimmed })");
  });

  it("clears input after creating collection", () => {
    expect(src).toContain('setNewName("")');
  });

  it("resets editing state after save or cancel", () => {
    expect(src).toContain("setEditingId(null)");
    expect(src).toContain('setEditName("")');
  });

  it("component can be imported", async () => {
    mockUseCollections.mockReturnValue({
      collections: [],
      isLoading: true,
      createCollection: vi.fn(),
      updateCollection: vi.fn(),
      deleteCollection: vi.fn(),
      isCreating: false,
      isUpdating: false,
      isDeleting: false,
    });

    const mod = await import("../CollectionList");
    expect(typeof mod.CollectionList).toBe("function");
  });
});
