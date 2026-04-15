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
  it("shows loading spinner when loading", () => {
    mockedUseRecipes.mockReturnValue({
      data: undefined,
      isLoading: true,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    } as any);
    renderPage();
    expect(document.querySelector(".animate-spin")).toBeTruthy();
  });

  it("shows recipe cards when data is loaded", () => {
    mockedUseRecipes.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              { id: "r1", title: "Pasta Carbonara", domain: "example.com", image_url: null, total_time: 30 },
              { id: "r2", title: "Chicken Tikka", domain: "food.com", image_url: null, total_time: 45 },
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
    renderPage();
    expect(screen.getByText("Pasta Carbonara")).toBeDefined();
    expect(screen.getByText("Chicken Tikka")).toBeDefined();
  });

  it("shows Load More button when hasNextPage is true", () => {
    const fetchNextPage = vi.fn();
    mockedUseRecipes.mockReturnValue({
      data: {
        pages: [
          {
            items: [
              { id: "r1", title: "Pasta", domain: "example.com", image_url: null, total_time: 30 },
            ],
            next_cursor: "abc",
          },
        ],
      },
      isLoading: false,
      hasNextPage: true,
      fetchNextPage,
      isFetchingNextPage: false,
    } as any);
    renderPage();
    const button = screen.getByText("Load More");
    expect(button).toBeDefined();
    fireEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalled();
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
    expect(screen.getByText("No recipes found")).toBeDefined();
  });
});
