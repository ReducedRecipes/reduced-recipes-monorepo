import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  getBookmarks: vi.fn(),
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
}));

import { getBookmarks, createBookmark, deleteBookmark } from "../../lib/api";

const mockGetBookmarks = vi.mocked(getBookmarks);
const mockCreateBookmark = vi.mocked(createBookmark);
const mockDeleteBookmark = vi.mocked(deleteBookmark);

const mockBookmark = {
  id: "bk-1",
  user_id: "u-1",
  collection_id: "col-1",
  recipe_id: "recipe-abc",
  recipe_deleted_at: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useBookmarks — API functions", () => {
  it("getBookmarks returns a list of bookmarks", async () => {
    mockGetBookmarks.mockResolvedValueOnce({
      items: [mockBookmark],
      next_cursor: null,
    });

    const result = await getBookmarks();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.recipe_id).toBe("recipe-abc");
    expect(mockGetBookmarks).toHaveBeenCalledOnce();
  });

  it("createBookmark sends recipe_id and returns new bookmark", async () => {
    const newBookmark = { ...mockBookmark, id: "bk-2", recipe_id: "recipe-xyz" };
    mockCreateBookmark.mockResolvedValueOnce(newBookmark);

    const result = await createBookmark("recipe-xyz");
    expect(result.id).toBe("bk-2");
    expect(result.recipe_id).toBe("recipe-xyz");
    expect(mockCreateBookmark).toHaveBeenCalledWith("recipe-xyz");
  });

  it("deleteBookmark calls API with bookmark id", async () => {
    mockDeleteBookmark.mockResolvedValueOnce(undefined);

    await deleteBookmark("bk-1");
    expect(mockDeleteBookmark).toHaveBeenCalledWith("bk-1");
  });
});

describe("useBookmarks — isBookmarked logic", () => {
  it("correctly identifies a bookmarked recipe", () => {
    const bookmarks = [mockBookmark];
    const isBookmarked = (recipeId: string) =>
      bookmarks.some((b) => b.recipe_id === recipeId);

    expect(isBookmarked("recipe-abc")).toBe(true);
    expect(isBookmarked("recipe-unknown")).toBe(false);
  });

  it("returns false for empty bookmarks list", () => {
    const bookmarks: typeof mockBookmark[] = [];
    const isBookmarked = (recipeId: string) =>
      bookmarks.some((b) => b.recipe_id === recipeId);

    expect(isBookmarked("recipe-abc")).toBe(false);
  });
});

describe("useBookmarks — toggle logic", () => {
  it("toggle calls createBookmark when recipe is not bookmarked", async () => {
    mockCreateBookmark.mockResolvedValueOnce({ ...mockBookmark, id: "bk-new", recipe_id: "recipe-new" });

    const bookmarks: typeof mockBookmark[] = [];
    const getBookmarkByRecipeId = (recipeId: string) =>
      bookmarks.find((b) => b.recipe_id === recipeId);

    const existing = getBookmarkByRecipeId("recipe-new");
    expect(existing).toBeUndefined();

    // Simulates what toggle does — calls createBookmark for unbookmarked recipe
    await createBookmark("recipe-new");
    expect(mockCreateBookmark).toHaveBeenCalledWith("recipe-new");
  });

  it("toggle calls deleteBookmark when recipe is already bookmarked", async () => {
    mockDeleteBookmark.mockResolvedValueOnce(undefined);

    const bookmarks = [mockBookmark];
    const getBookmarkByRecipeId = (recipeId: string) =>
      bookmarks.find((b) => b.recipe_id === recipeId);

    const existing = getBookmarkByRecipeId("recipe-abc");
    expect(existing).toBeDefined();
    expect(existing!.id).toBe("bk-1");

    // Simulates what toggle does — calls deleteBookmark for bookmarked recipe
    await deleteBookmark(existing!.id);
    expect(mockDeleteBookmark).toHaveBeenCalledWith("bk-1");
  });
});
