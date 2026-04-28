import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "../components/Layout";

beforeAll(() => {
  globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

// Mock auth and layout sub-components
vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isNewUser: false,
    logout: vi.fn(),
    login: vi.fn(),
    checkAuth: vi.fn(),
  }),
}));

vi.mock("../components/NotificationBell", () => ({ default: () => null }));
vi.mock("../components/LoginButton", () => ({ LoginButton: () => null }));
vi.mock("../components/DietaryOnboarding", () => ({ DietaryOnboarding: () => null }));

// Mock all hooks used by page components
vi.mock("../hooks/useRecipes", () => ({
  useRecipes: vi.fn(() => ({
    data: { pages: [{ items: [], next_cursor: null }] },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  })),
}));

vi.mock("../hooks/useRecipe", () => ({
  useRecipe: vi.fn(() => ({
    data: null,
    isLoading: false,
    error: null,
  })),
}));

vi.mock("../hooks/useSearch", () => ({
  useSearch: vi.fn(() => ({
    data: [],
    isLoading: false,
  })),
}));

vi.mock("../hooks/useDomainRecipes", () => ({
  useDomainRecipes: vi.fn(() => ({
    data: { items: [] },
    isLoading: false,
    error: null,
  })),
}));

vi.mock("../hooks/useHealth", () => ({
  useHealth: vi.fn(() => ({
    health: {
      total_recipes: 142083,
      total_words_removed: 184000000,
      total_ads_removed: 50000,
      avg_cook_time: 35,
      sources_count: 1200,
      new_this_week: 500,
      under_30_min: 40000,
      vegetarian: 30000,
      translated_recipes: 5000,
    },
  })),
}));

vi.mock("../hooks/useFunding", () => ({
  useFunding: vi.fn(() => ({
    funding: null,
  })),
}));

vi.mock("../lib/api", () => ({
  submitRemoval: vi.fn(),
}));

import HomePage from "../pages/HomePage";
import RecipePage from "../pages/RecipePage";
import SearchPage from "../pages/SearchPage";
import TagPage from "../pages/TagPage";
import CuisinePage from "../pages/CuisinePage";
import DomainPage from "../pages/DomainPage";
import RemovePage from "../pages/RemovePage";
import ManifestoPage from "../pages/ManifestoPage";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderApp(initialRoute: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/recipe/:id" element={<RecipePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/tag/:tag" element={<TagPage />} />
            <Route path="/cuisine/:cuisine" element={<CuisinePage />} />
            <Route path="/site/:domain" element={<DomainPage />} />
            <Route path="/remove" element={<RemovePage />} />
            <Route path="/about" element={<ManifestoPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("main.tsx route definitions", () => {
  it("renders HomePage at /", () => {
    renderApp("/");
    expect(screen.getByText(/Fig\. 001 — Manifesto/)).toBeDefined();
  });

  it("renders RecipePage at /recipe/:id without crashing", () => {
    const { container } = renderApp("/recipe/abc123");
    // RecipePage returns null when no recipe and not loading
    expect(container).toBeDefined();
  });

  it("renders SearchPage at /search", () => {
    renderApp("/search");
    expect(screen.getByText(/Search.*recipes/)).toBeDefined();
  });

  it("renders TagPage at /tag/:tag", () => {
    renderApp("/tag/pasta");
    expect(screen.getByText("No recipes found.")).toBeDefined();
  });

  it("renders CuisinePage at /cuisine/:cuisine", () => {
    renderApp("/cuisine/italian");
    expect(screen.getByText("No recipes found")).toBeDefined();
  });

  it("renders DomainPage at /site/:domain", () => {
    renderApp("/site/example.com");
    expect(screen.getByText("No recipes found.")).toBeDefined();
  });

  it("renders RemovePage at /remove", () => {
    renderApp("/remove");
    expect(screen.getByText("Request Recipe Removal")).toBeDefined();
  });

  it("renders ManifestoPage at /about", () => {
    renderApp("/about");
    expect(screen.getByText("We cut the bullshit.")).toBeDefined();
    expect(screen.getByText("Words removed")).toBeDefined();
    expect(screen.getByText("184.0M")).toBeDefined();
    expect(screen.getByText("Stories per recipe")).toBeDefined();
  });

  it("wraps all routes in Layout with header", () => {
    renderApp("/");
    expect(screen.getAllByText("Reduced").length).toBeGreaterThan(0);
    expect(screen.getAllByText("RECIPES").length).toBeGreaterThan(0);
    expect(screen.getByText("00 — Index")).toBeDefined();
  });
});
