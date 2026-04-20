import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../hooks/useRecipes", () => ({
  useRecipes: vi.fn(),
}));

import { useRecipes } from "../hooks/useRecipes";
import HomePage from "../pages/HomePage";

const mockedUseRecipes = vi.mocked(useRecipes);

const MOCK_ITEMS = [
  { id: "r1", title: "Pasta Carbonara", domain: "example.com", image_url: null, total_time: 30, tags: [] },
  { id: "r2", title: "Chicken Tikka", domain: "food.com", image_url: null, total_time: 45, tags: [] },
  { id: "r3", title: "Quick Salad", domain: "test.com", image_url: null, total_time: 10, tags: [] },
  { id: "r4", title: "Beef Stew", domain: "chef.com", image_url: null, total_time: 90, tags: [] },
  { id: "r5", title: "Fish Tacos", domain: "yum.com", image_url: null, total_time: 25, tags: [] },
  { id: "r6", title: "Veggie Soup", domain: "healthy.com", image_url: null, total_time: 40, tags: [] },
  { id: "r7", title: "Mushroom Risotto", domain: "cook.com", image_url: null, total_time: 50, tags: [] },
  { id: "r8", title: "Grilled Salmon", domain: "sea.com", image_url: null, total_time: 20, tags: [] },
  { id: "r9", title: "Caesar Salad", domain: "fresh.com", image_url: null, total_time: 15, tags: [] },
  { id: "r10", title: "Lemon Chicken", domain: "home.com", image_url: null, total_time: 35, tags: [] },
];

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
    it("renders the manifesto headline", () => {
      mockLoaded();
      renderPage();
      expect(
        screen.getByText("Recipes, reduced to what you actually need"),
      ).toBeDefined();
    });

    it("renders stat panel with Indexed label", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Indexed")).toBeDefined();
    });
  });

  describe("Ingredient board", () => {
    it("renders the ingredient section header", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("What's in your fridge")).toBeDefined();
    });

    it("renders ingredient input", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByPlaceholderText("Add ingredient...")).toBeDefined();
    });

    it("adds ingredient via suggestion pill", () => {
      mockLoaded();
      renderPage();
      fireEvent.click(screen.getByText("+ chicken"));
      expect(screen.getByText(/chicken/)).toBeDefined();
    });
  });

  describe("Featured recipe", () => {
    it("renders featured recipe title", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Pasta Carbonara")).toBeDefined();
    });

    it("renders Read recipe CTA", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText(/Read recipe/)).toBeDefined();
    });
  });

  describe("Trending shelf", () => {
    it("renders trending section", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Trending")).toBeDefined();
    });
  });

  describe("Seasonal list", () => {
    it("renders seasonal section with row layout", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("In season")).toBeDefined();
    });
  });

  describe("Browse matrix", () => {
    it("renders browse categories", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("By time")).toBeDefined();
      expect(screen.getByText("By diet")).toBeDefined();
      expect(screen.getByText("By method")).toBeDefined();
      expect(screen.getAllByText("By source").length).toBeGreaterThan(0);
    });

    it("renders browse links", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Under 15 min")).toBeDefined();
      expect(screen.getByText("Vegetarian")).toBeDefined();
    });
  });

  describe("Footer", () => {
    it("renders footer with brand", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Reduced")).toBeDefined();
    });

    it("renders footer link sections", () => {
      mockLoaded();
      renderPage();
      expect(screen.getByText("Manifesto")).toBeDefined();
    });
  });
});
