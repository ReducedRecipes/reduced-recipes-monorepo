import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Layout from "../Layout";

vi.mock("../../hooks/useAuth", () => ({
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

vi.mock("../../hooks/useRecipes", () => ({
  useRecipes: () => ({
    data: undefined,
    isLoading: false,
  }),
}));

vi.mock("../LoginButton", () => ({ LoginButton: () => null }));
vi.mock("../DietaryOnboarding", () => ({ DietaryOnboarding: () => null }));

afterEach(cleanup);

function renderLayout(initialRoute = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<div>home-outlet</div>} />
            <Route path="/search" element={<div>search-outlet</div>} />
            <Route path="/about" element={<div>about-outlet</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Layout", () => {
  it("renders the brand link pointing to /", () => {
    renderLayout();
    const reduced = screen.getByText("Reduced");
    expect(reduced.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("renders section nav with Index, Browse, Recipe, Manifesto", () => {
    renderLayout();
    expect(screen.getByText("00 — Index")).toBeDefined();
    expect(screen.getByText("01 — Browse")).toBeDefined();
    expect(screen.getByText("02 — Recipe")).toBeDefined();
    expect(screen.getByText("03 — Manifesto")).toBeDefined();
  });

  it("renders child route via Outlet", () => {
    renderLayout("/");
    expect(screen.getByText("home-outlet")).toBeDefined();
  });

  it("renders different child route via Outlet", () => {
    renderLayout("/search");
    expect(screen.getByText("search-outlet")).toBeDefined();
  });

  it("has a sticky header", () => {
    const { container } = renderLayout();
    const header = container.querySelector("header");
    expect(header?.className).toContain("sticky");
  });

  it("renders the utility strip with EST. 2024", () => {
    renderLayout();
    expect(screen.getByText("EST. 2024")).toBeDefined();
  });
});
