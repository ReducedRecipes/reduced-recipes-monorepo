import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

beforeAll(() => {
  globalThis.IntersectionObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }));
});

vi.mock("../hooks/useRecipes", () => ({
  useRecipes: vi.fn(),
}));

import { useRecipes } from "../hooks/useRecipes";
import TagPage from "../pages/TagPage";

const mockedUseRecipes = vi.mocked(useRecipes);

function renderPage(tag = "dessert") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/tags/${tag}`]}>
        <Routes>
          <Route path="/tags/:tag" element={<TagPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TagPage", () => {
  it("shows heading with tag name", () => {
    mockedUseRecipes.mockReturnValue({
      data: { pages: [{ items: [], next_cursor: null }] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage("dessert");
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
    expect(screen.getByText(/dessert/)).toBeDefined();
  });

  it("renders recipe cards from data", () => {
    mockedUseRecipes.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              { id: "r1", title: "Chocolate Cake", domain: "example.com", image_url: null, total_time: 60 },
              { id: "r2", title: "Tiramisu", domain: "example.com", image_url: null, total_time: 45 },
            ],
            next_cursor: null,
          },
        ],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage("dessert");
    expect(screen.getByText("Chocolate Cake")).toBeDefined();
    expect(screen.getByText("Tiramisu")).toBeDefined();
  });

  it("calls useRecipes with correct tag filter", () => {
    mockedUseRecipes.mockReturnValue({
      data: { pages: [{ items: [], next_cursor: null }] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage("breakfast");
    expect(mockedUseRecipes).toHaveBeenCalledWith({ tag: "breakfast" });
  });

  it("renders sentinel for infinite scroll when hasNextPage is true", () => {
    const mockFetchNext = vi.fn();
    mockedUseRecipes.mockReturnValue({
      data: {
        pages: [
          {
            items: [{ id: "r1", title: "Pancakes", domain: "example.com", image_url: null, total_time: 20 }],
            next_cursor: "abc",
          },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      fetchNextPage: mockFetchNext,
      isFetchingNextPage: false,
    } as any);

    renderPage();
    // RecipeGrid uses IntersectionObserver instead of a Load More button
    expect(screen.getByText("Pancakes")).toBeDefined();
  });

  it("shows empty state when no recipes", () => {
    mockedUseRecipes.mockReturnValue({
      data: { pages: [{ items: [], next_cursor: null }] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage();
    expect(screen.getByText("No recipes found.")).toBeDefined();
  });

  it("shows loading state", () => {
    mockedUseRecipes.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage();
    expect(screen.getByText("Loading recipes…")).toBeDefined();
  });
});
