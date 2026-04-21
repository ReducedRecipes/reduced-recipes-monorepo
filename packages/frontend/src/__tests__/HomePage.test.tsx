import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../hooks/useRecipes", () => ({
  useRecipes: vi.fn(),
}));

vi.mock("../hooks/useHealth", () => ({
  useHealth: vi.fn().mockReturnValue({ health: null, isLoading: false }),
}));

import { useRecipes } from "../hooks/useRecipes";
import { useHealth } from "../hooks/useHealth";
import HomePage from "../pages/HomePage";

const mockedUseRecipes = vi.mocked(useRecipes);
const mockedUseHealth = vi.mocked(useHealth);

const MOCK_ITEMS = Array.from({ length: 14 }, (_, i) => ({
  id: `r${i + 1}`,
  title: `Recipe ${i + 1}`,
  domain: "example.com",
  image_url: null,
  total_time: 20 + i * 5,
  cook_time: null,
  yields: "4 servings",
  cuisine: null,
  category: "Dinner",
  tags: ["easy", "quick"],
}));

function mockLoaded(items = MOCK_ITEMS) {
  mockedUseRecipes.mockReturnValue({
    data: { pages: [{ items, next_cursor: null }] },
    isLoading: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  } as any);
}

function mockLoading() {
  mockedUseRecipes.mockReturnValue({
    data: undefined,
    isLoading: true,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
  } as any);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("HomePage", () => {
  it("shows loading state when loading", () => {
    mockLoading();
    renderPage();
    expect(screen.getByText(/Loading index/)).toBeDefined();
  });

  describe("Hero section", () => {
    it("renders the Fig. 001 manifesto label", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Fig\. 001 — Manifesto/)).toBeDefined();
    });

    it("renders the manifesto headline with line breaks", () => {
      mockLoaded();
      renderPage();
      expect(screen.getAllByText(/Recipes,/).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/you actually need/).length).toBeGreaterThan(0);
    });

    it("renders CTA buttons", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/See a recipe/)).toBeDefined();
      expect(screen.getByText("Browse the index")).toBeDefined();
    });

    it("renders stat panel with specimen label", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Specimen 001/)).toBeDefined();
    });

    it("renders stat panel stats", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Median read")).toBeDefined();
      expect(screen.getByText("Avg. cook")).toBeDefined();
      expect(screen.getByText("Ads removed")).toBeDefined();
    });

    it("renders today's index section", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Today/)).toBeDefined();
      expect(screen.getByText("New this week")).toBeDefined();
    });
  });

  describe("Ingredient board", () => {
    it("renders Fig. 002 label", () => {
      mockLoaded();
      renderPage();
      expect(
        screen.getByText("Fig. 002 — What's in your fridge"),
      ).toBeDefined();
    });

    it("renders Have and Exclude boards", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Have/)).toBeDefined();
      expect(screen.getByText(/Exclude/)).toBeDefined();
    });

    it("renders match count and Run query button", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/recipes match/)).toBeDefined();
      expect(screen.getByText(/Run query/)).toBeDefined();
    });
  });

  it("requests recipes with sort=hot", () => {
    mockLoaded();
    renderPage();
    const calls = mockedUseRecipes.mock.calls;
    const hotCall = calls.find((c) => (c[0] as Record<string, unknown>)?.sort === "hot");
    expect(hotCall).toBeDefined();
  });

  describe("Featured recipe", () => {
    it("renders Fig. 003 label", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Fig\. 003 — Feature of the week/)).toBeDefined();
    });

    it("renders featured recipe title", () => {
      mockLoaded();
      renderPage();
      expect(screen.getAllByText("Recipe 1").length).toBeGreaterThan(0);
    });

    it("prefers health.featured_recipe_id when set", () => {
      const itemsWithFeatured = [
        ...MOCK_ITEMS,
        { id: "hot-recipe", title: "Trending Hot Recipe", domain: "example.com", image_url: null, total_time: 25, cook_time: null, yields: null, cuisine: null, category: null, tags: [] },
      ];
      mockedUseRecipes.mockReturnValue({
        data: { pages: [{ items: itemsWithFeatured, next_cursor: null }] },
        isLoading: false,
        hasNextPage: false,
        fetchNextPage: vi.fn(),
        isFetchingNextPage: false,
      } as any);
      mockedUseHealth.mockReturnValue({
        health: { featured_recipe_id: "hot-recipe", featured_recipe_title: "Trending Hot Recipe" } as any,
        isLoading: false,
      });
      renderPage();
      expect(screen.getAllByText("Trending Hot Recipe").length).toBeGreaterThan(0);
    });

    it("renders Open recipe CTA", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Open recipe/)).toBeDefined();
    });

    it("renders step labels grid", () => {
      mockLoaded();
      renderPage();
      expect(screen.getAllByText(/01/).length).toBeGreaterThan(0);
    });
  });

  describe("Trending shelf", () => {
    it("renders Fig. 004 trending section", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Trending this week")).toBeDefined();
    });

    it("renders See all link", () => {
      mockLoaded();
      renderPage();
      expect(screen.getAllByText(/See all/).length).toBeGreaterThan(0);
    });
  });

  describe("Seasonal list", () => {
    it("renders Fig. 005 seasonal section", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/In season/)).toBeDefined();
    });
  });

  describe("Browse matrix", () => {
    it("renders Fig. 007 browse label", () => {
      mockLoaded();
      renderPage();
      expect(
        screen.getByText("Fig. 007 — Browse by axis"),
      ).toBeDefined();
    });

    it("renders browse categories with arrows", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("By time")).toBeDefined();
      expect(screen.getByText("By diet")).toBeDefined();
      expect(screen.getByText("By method")).toBeDefined();
    });

    it("renders browse items matching design", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("\u2264 15 min")).toBeDefined();
      expect(screen.getAllByText("Vegetarian").length).toBeGreaterThan(0);
      expect(screen.getAllByText("One-pan").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Keto").length).toBeGreaterThan(0);
    });
  });

  describe("Footer", () => {
    it("renders footer with brand", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Reduced Recipes")).toBeDefined();
    });

    it("renders copyright", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/2026/)).toBeDefined();
    });

    it("renders footer link sections", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Index")).toBeDefined();
      expect(screen.getByText("About")).toBeDefined();
      expect(screen.getByText("Tools")).toBeDefined();
    });
  });
});
