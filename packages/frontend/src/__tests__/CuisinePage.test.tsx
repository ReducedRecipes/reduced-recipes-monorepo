import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../hooks/useRecipes", () => ({
  useRecipes: vi.fn(),
}));

import { useRecipes } from "../hooks/useRecipes";
import CuisinePage from "../pages/CuisinePage";

const mockedUseRecipes = vi.mocked(useRecipes);

function renderPage(route = "/cuisines/italian") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/cuisines/:cuisine" element={<CuisinePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CuisinePage", () => {
  it("shows heading with cuisine name", () => {
    mockedUseRecipes.mockReturnValue({
      data: { pages: [{ items: [], next_cursor: null }], pageParams: [] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage();
    expect(screen.getByText("Italian Cuisine Recipes")).toBeDefined();
  });

  it("renders recipe cards", () => {
    mockedUseRecipes.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              { id: "r1", title: "Margherita Pizza", domain: "example.com", image_url: null, total_time: 45 },
              { id: "r2", title: "Tiramisu", domain: "example.com", image_url: null, total_time: 60 },
            ],
            next_cursor: null,
          },
        ],
        pageParams: [],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage();
    expect(screen.getByText("Margherita Pizza")).toBeDefined();
    expect(screen.getByText("Tiramisu")).toBeDefined();
  });

  it("calls useRecipes with correct cuisine filter", () => {
    mockedUseRecipes.mockReturnValue({
      data: { pages: [{ items: [], next_cursor: null }], pageParams: [] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage("/cuisines/mexican");
    expect(mockedUseRecipes).toHaveBeenCalledWith({ cuisine: "mexican" });
  });

  it("shows Load More button when hasNextPage is true", () => {
    const fetchNextPage = vi.fn();
    mockedUseRecipes.mockReturnValue({
      data: {
        pages: [
          {
            items: [{ id: "r1", title: "Pasta", domain: "example.com", image_url: null, total_time: 30 }],
            next_cursor: "abc",
          },
        ],
        pageParams: [],
      },
      isLoading: false,
      hasNextPage: true,
      fetchNextPage,
      isFetchingNextPage: false,
    } as any);

    renderPage();
    const btn = screen.getByText("Load More");
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it("shows empty state when no recipes", () => {
    mockedUseRecipes.mockReturnValue({
      data: { pages: [{ items: [], next_cursor: null }], pageParams: [] },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);

    renderPage();
    expect(screen.getByText("No recipes found")).toBeDefined();
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
    expect(screen.getByText("Loading…")).toBeDefined();
  });
});
