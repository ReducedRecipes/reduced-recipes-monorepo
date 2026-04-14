import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import Layout from "../Layout";

afterEach(cleanup);

function renderLayout(initialRoute = "/") {
  return render(
    <MemoryRouter initialEntries={[initialRoute]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<div>home-outlet</div>} />
          <Route path="/remove" element={<div>remove-outlet</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

describe("Layout", () => {
  it("renders the logo link pointing to /", () => {
    renderLayout();
    const logo = screen.getByText("ReducedRecipes");
    expect(logo.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("renders Home and Opt-out nav links", () => {
    renderLayout();
    const homeLink = screen.getByRole("link", { name: "Home" });
    expect(homeLink.getAttribute("href")).toBe("/");

    const optOutLink = screen.getByRole("link", { name: "Opt-out" });
    expect(optOutLink.getAttribute("href")).toBe("/remove");
  });

  it("renders the search bar", () => {
    renderLayout();
    expect(screen.getAllByPlaceholderText("Search recipes...").length).toBeGreaterThan(0);
  });

  it("renders child route via Outlet", () => {
    renderLayout("/");
    expect(screen.getByText("home-outlet")).toBeDefined();
  });

  it("renders different child route via Outlet", () => {
    renderLayout("/remove");
    expect(screen.getByText("remove-outlet")).toBeDefined();
  });

  it("has a sticky header", () => {
    const { container } = renderLayout();
    const header = container.querySelector("header");
    expect(header?.className).toContain("sticky");
  });
});
