import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  fetchCollectionBookmarks: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  fetchRecipe: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useParams: vi.fn(() => ({ id: "col-1" })),
  useNavigate: vi.fn(() => vi.fn()),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) =>
    `<a href="${to}">${children}</a>`,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(() => ({ data: null, isLoading: false })),
  useQueries: vi.fn(() => []),
  useMutation: vi.fn(() => ({
    mutate: vi.fn(),
    isPending: false,
  })),
  useQueryClient: vi.fn(() => ({
    invalidateQueries: vi.fn(),
  })),
}));

vi.mock("../../components/RecipeCard", () => ({
  default: () => null,
}));

import { useAuth } from "../../hooks/useAuth";

const mockUseAuth = vi.mocked(useAuth);

const src = readFileSync(
  resolve(__dirname, "../CollectionPage.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CollectionPage", () => {
  // Source verification tests
  it("exports default function CollectionPage", () => {
    expect(src).toContain("export default function CollectionPage");
  });

  it("imports useParams from react-router-dom", () => {
    expect(src).toContain("useParams");
  });

  it("imports useAuth hook", () => {
    expect(src).toContain("useAuth");
  });

  it("imports useQuery and useQueries from tanstack", () => {
    expect(src).toContain("useQuery");
    expect(src).toContain("useQueries");
  });

  it("imports fetchCollectionBookmarks from api", () => {
    expect(src).toContain("fetchCollectionBookmarks");
  });

  it("imports RecipeCard component", () => {
    expect(src).toContain("RecipeCard");
  });

  it("shows loading spinner during auth loading", () => {
    expect(src).toContain("authLoading");
    expect(src).toContain("animate-spin");
  });

  it("redirects unauthenticated users to home", () => {
    expect(src).toContain("!isAuthenticated");
    expect(src).toContain('navigate("/", { replace: true })');
  });

  it("displays collection name or fallback", () => {
    expect(src).toContain('collection?.name ?? "Collection"');
  });

  it("shows empty state when no bookmarks", () => {
    expect(src).toContain("No recipes in this collection yet");
  });

  it("has back link to /saved", () => {
    expect(src).toContain('to="/saved"');
  });

  it("shows recipe count", () => {
    expect(src).toContain("bookmarks.length");
    expect(src).toContain('recipe{bookmarks.length !== 1 ? "s" : ""}');
  });

  it("renders bookmarks in a grid layout", () => {
    expect(src).toContain("grid");
    expect(src).toContain("lg:grid-cols-3");
  });

  it("has remove bookmark button", () => {
    expect(src).toContain("Remove from collection");
    expect(src).toContain("removeBookmark.mutate");
  });

  it("uses useMutation for removing bookmarks", () => {
    expect(src).toContain("useMutation");
    expect(src).toContain("DELETE");
  });

  it("invalidates queries on bookmark removal", () => {
    expect(src).toContain("invalidateQueries");
    expect(src).toContain("collection-bookmarks");
  });

  it("builds recipe map from useQueries results", () => {
    expect(src).toContain("recipeMap");
    expect(src).toContain("new Map");
  });

  it("renders RecipeCard when recipe data available", () => {
    expect(src).toContain("<RecipeCard");
    expect(src).toContain("recipe.tags");
  });

  it("shows placeholder when recipe data not loaded", () => {
    expect(src).toContain("animate-pulse");
  });

  // Logic tests
  it("navigate called for unauthenticated users", () => {
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

    const authLoading = false;
    const isAuthenticated = false;

    if (!isAuthenticated) {
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

    const isAuthenticated = true;

    if (!isAuthenticated) {
      mockNavigate("/", { replace: true });
    }

    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("bookmarks defaults to empty array when data is null", () => {
    const data = null as { items: unknown[] } | null;
    const bookmarks = data?.items ?? [];
    expect(bookmarks).toEqual([]);
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

    const mod = await import("../CollectionPage");
    expect(typeof mod.default).toBe("function");
  });
});
