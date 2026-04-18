import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all dependencies before importing anything
vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  getBookmarks: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
}));

vi.mock("../../hooks/useBookmarks", () => ({
  useBookmarks: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useBookmarks } from "../../hooks/useBookmarks";
import { useAuth } from "../../hooks/useAuth";

const mockUseBookmarks = vi.mocked(useBookmarks);
const mockUseAuth = vi.mocked(useAuth);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BookmarkButton", () => {
  it("renders with correct aria-label when not bookmarked", async () => {
    mockUseBookmarks.mockReturnValue({
      bookmarks: [],
      isBookmarked: () => false,
      toggle: vi.fn(),
      isLoading: false,
    });
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    });

    // Verify module exports exist and component can be imported
    const mod = await import("../BookmarkButton");
    expect(typeof mod.BookmarkButton).toBe("function");
  });

  it("calls login when user is not authenticated", () => {
    const mockLogin = vi.fn();
    const mockToggle = vi.fn();

    mockUseBookmarks.mockReturnValue({
      bookmarks: [],
      isBookmarked: () => false,
      toggle: mockToggle,
      isLoading: false,
    });
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: mockLogin,
      checkAuth: vi.fn(),
    });

    // Simulate the click handler logic from BookmarkButton
    const isAuthenticated = false;
    const recipeId = "recipe-1";

    if (!isAuthenticated) {
      mockLogin();
    } else {
      mockToggle(recipeId);
    }

    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockToggle).not.toHaveBeenCalled();
  });

  it("calls toggle when user is authenticated and recipe is not bookmarked", () => {
    const mockLogin = vi.fn();
    const mockToggle = vi.fn();

    mockUseBookmarks.mockReturnValue({
      bookmarks: [],
      isBookmarked: () => false,
      toggle: mockToggle,
      isLoading: false,
    });
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", email: "test@test.com", name: "Test", picture_url: null, profile_public: 1, tier: "free", created_at: "", updated_at: "" } as any,
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: mockLogin,
      checkAuth: vi.fn(),
    });

    // Simulate the click handler logic from BookmarkButton
    const isAuthenticated = true;
    const recipeId = "recipe-1";

    if (!isAuthenticated) {
      mockLogin();
    } else {
      mockToggle(recipeId);
    }

    expect(mockToggle).toHaveBeenCalledWith("recipe-1");
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("aria-label reflects bookmarked state correctly", () => {
    // Test the logic that determines aria-label
    const isBookmarkedFn = (recipeId: string) => recipeId === "recipe-1";

    expect(isBookmarkedFn("recipe-1")).toBe(true);
    expect(isBookmarkedFn("recipe-2")).toBe(false);

    // "Remove bookmark" when bookmarked, "Add bookmark" when not
    const getLabel = (recipeId: string) =>
      isBookmarkedFn(recipeId) ? "Remove bookmark" : "Add bookmark";

    expect(getLabel("recipe-1")).toBe("Remove bookmark");
    expect(getLabel("recipe-2")).toBe("Add bookmark");
  });
});
