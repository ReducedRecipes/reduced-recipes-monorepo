import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../lib/api", () => ({
  searchRecipes: vi.fn(),
}));

import { searchRecipes } from "../lib/api";
import SearchPage from "../pages/SearchPage";

const mockedSearch = vi.mocked(searchRecipes);

function renderPage(route: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <SearchPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchPage", () => {
  it("shows hint when query is too short", () => {
    renderPage("/search?q=a");
    expect(
      screen.getByText("Enter at least 2 characters to search."),
    ).toBeDefined();
  });

  it("shows heading with query term", async () => {
    mockedSearch.mockResolvedValue([
      {
        id: "r1",
        title: "Pasta",
        domain: "example.com",
        image_url: null,
        total_time: 30,
      } as any,
    ]);
    renderPage("/search?q=pasta");
    expect(
      await screen.findByText(/Search results for/),
    ).toBeDefined();
  });

  it("shows no results message when empty", async () => {
    mockedSearch.mockResolvedValue([]);
    renderPage("/search?q=xyz");
    expect(await screen.findByText("No results found.")).toBeDefined();
  });
});
