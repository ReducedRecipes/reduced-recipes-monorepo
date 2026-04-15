import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../hooks/useDomainRecipes", () => ({
  useDomainRecipes: vi.fn(),
}));

import { useDomainRecipes } from "../hooks/useDomainRecipes";
import DomainPage from "../pages/DomainPage";

const mockedUseDomainRecipes = vi.mocked(useDomainRecipes);

function renderPage(domain = "example.com") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/domains/${domain}`]}>
        <Routes>
          <Route path="/domains/:domain" element={<DomainPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("DomainPage", () => {
  it("shows heading with domain name", () => {
    mockedUseDomainRecipes.mockReturnValue({
      data: { items: [], next_cursor: null },
      isLoading: false,
      error: null,
    } as any);

    renderPage("example.com");
    expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
    expect(screen.getByText(/example\.com/)).toBeDefined();
  });

  it("renders recipe cards from data", () => {
    mockedUseDomainRecipes.mockReturnValue({
      data: {
        items: [
          { id: "r1", title: "Pasta Carbonara", domain: "example.com", image_url: null, total_time: 30 },
          { id: "r2", title: "Margherita Pizza", domain: "example.com", image_url: null, total_time: 45 },
        ],
        next_cursor: null,
      },
      isLoading: false,
      error: null,
    } as any);

    renderPage("example.com");
    expect(screen.getByText("Pasta Carbonara")).toBeDefined();
    expect(screen.getByText("Margherita Pizza")).toBeDefined();
  });

  it("calls useDomainRecipes with correct domain", () => {
    mockedUseDomainRecipes.mockReturnValue({
      data: { items: [], next_cursor: null },
      isLoading: false,
      error: null,
    } as any);

    renderPage("cooking.com");
    expect(mockedUseDomainRecipes).toHaveBeenCalledWith("cooking.com");
  });

  it("shows empty state when no recipes", () => {
    mockedUseDomainRecipes.mockReturnValue({
      data: { items: [], next_cursor: null },
      isLoading: false,
      error: null,
    } as any);

    renderPage();
    expect(screen.getByText("No recipes found.")).toBeDefined();
  });

  it("shows loading state", () => {
    mockedUseDomainRecipes.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    renderPage();
    expect(screen.getByText("Loading recipes…")).toBeDefined();
  });

  it("shows error state", () => {
    mockedUseDomainRecipes.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error("fetch failed"),
    } as any);

    renderPage();
    expect(screen.getByText("Failed to load recipes for this domain.")).toBeDefined();
  });
});
