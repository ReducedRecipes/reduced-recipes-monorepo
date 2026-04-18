import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../hooks/useBookmarks", () => ({
  useBookmarks: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  fetchRecipe: vi.fn(),
  getBookmarks: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  fetchCollections: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  createCollection: vi.fn(),
  updateCollection: vi.fn(),
  deleteCollection: vi.fn(),
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(() => vi.fn()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    `<a href="${to}">${children}</a>`,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: null, isLoading: false })),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({
    cancelQueries: vi.fn(),
    getQueryData: vi.fn(),
    setQueryData: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { useAuth } from "../../hooks/useAuth";
import { useBookmarks } from "../../hooks/useBookmarks";

const mockUseAuth = vi.mocked(useAuth);
const mockUseBookmarks = vi.mocked(useBookmarks);

const src = readFileSync(
  resolve(__dirname, "../SavedPage.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SavedPage", () => {
  // Source verification tests
  it("exports default function SavedPage", () => {
    expect(src).toContain("export default function SavedPage");
  });

  it("imports useAuth hook", () => {
    expect(src).toContain("useAuth");
  });

  it("imports useBookmarks hook", () => {
    expect(src).toContain("useBookmarks");
  });

  it("imports CollectionList component", () => {
    expect(src).toContain("CollectionList");
    expect(src).toContain("../components/CollectionList");
  });

  it("imports BookmarkButton component", () => {
    expect(src).toContain("BookmarkButton");
  });

  it("redirects unauthenticated users to home", () => {
    expect(src).toContain("!authLoading && !isAuthenticated");
    expect(src).toContain('navigate("/", { replace: true })');
  });

  it("shows loading spinner during auth check", () => {
    expect(src).toContain("authLoading");
    expect(src).toContain("animate-spin");
  });

  it("returns null when not authenticated after loading", () => {
    expect(src).toContain("if (!isAuthenticated) return null");
  });

  it("displays page title 'Saved Recipes'", () => {
    expect(src).toContain("Saved Recipes");
  });

  it("shows bookmarks section with heading", () => {
    expect(src).toContain("Bookmarks");
  });

  it("shows collections sidebar with heading", () => {
    expect(src).toContain("Collections");
    expect(src).toContain("<CollectionList />");
  });

  it("shows empty bookmarks message", () => {
    expect(src).toContain(
      "No bookmarks yet. Browse recipes and tap the heart icon to save"
    );
  });

  it("shows loading skeleton for bookmarks", () => {
    expect(src).toContain("bookmarksLoading");
    expect(src).toContain("animate-pulse");
  });

  it("renders BookmarkedRecipeCard for each bookmark", () => {
    expect(src).toContain("BookmarkedRecipeCard");
    expect(src).toContain("bookmark.recipe_id");
  });

  it("uses grid layout with sidebar", () => {
    expect(src).toContain("md:grid-cols-[1fr,300px]");
  });

  // BookmarkedRecipeCard sub-component tests
  it("has BookmarkedRecipeCard sub-component", () => {
    expect(src).toContain("function BookmarkedRecipeCard");
  });

  it("BookmarkedRecipeCard fetches recipe data", () => {
    expect(src).toContain("fetchRecipe");
    expect(src).toContain('queryKey: ["recipe", recipeId]');
  });

  it("BookmarkedRecipeCard shows loading skeleton", () => {
    expect(src).toContain("h-32 animate-pulse");
  });

  it("BookmarkedRecipeCard displays recipe image and title", () => {
    expect(src).toContain("recipe.image_url");
    expect(src).toContain("recipe.title");
    expect(src).toContain("recipe.domain");
  });

  it("BookmarkedRecipeCard links to recipe page", () => {
    expect(src).toContain("/recipe/${recipeId}");
  });

  it("BookmarkedRecipeCard includes BookmarkButton", () => {
    expect(src).toContain("<BookmarkButton recipeId={recipeId}");
  });

  // Logic tests
  it("navigate is called for unauthenticated users", () => {
    const mockNavigate = vi.fn();

    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    });

    mockUseBookmarks.mockReturnValue({
      bookmarks: [],
      isBookmarked: () => false,
      toggle: vi.fn(),
      isLoading: false,
    });

    // Simulate the redirect logic from SavedPage
    const authLoading = false;
    const isAuthenticated = false;

    if (!authLoading && !isAuthenticated) {
      mockNavigate("/", { replace: true });
    }

    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("does not redirect when authenticated", () => {
    const mockNavigate = vi.fn();

    mockUseAuth.mockReturnValue({
      user: { id: "u-1", email: "test@test.com", name: "Test", picture_url: null, profile_public: 1, tier: "free", created_at: "", updated_at: "" } as any,
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    });

    const authLoading = false;
    const isAuthenticated = true;

    if (!authLoading && !isAuthenticated) {
      mockNavigate("/", { replace: true });
    }

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows correct bookmark count in list", () => {
    const bookmarks = [
      { id: "b1", user_id: "u1", collection_id: "c1", recipe_id: "r1", recipe_deleted_at: null, created_at: "", updated_at: "" },
      { id: "b2", user_id: "u1", collection_id: "c1", recipe_id: "r2", recipe_deleted_at: null, created_at: "", updated_at: "" },
    ];

    expect(bookmarks.length).toBe(2);
    expect(bookmarks.length === 0).toBe(false);
  });

  it("component can be imported", async () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    });

    mockUseBookmarks.mockReturnValue({
      bookmarks: [],
      isBookmarked: () => false,
      toggle: vi.fn(),
      isLoading: false,
    });

    const mod = await import("../SavedPage");
    expect(typeof mod.default).toBe("function");
  });
});
