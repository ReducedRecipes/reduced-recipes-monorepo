import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RecipeShelf from "../RecipeShelf";

afterEach(cleanup);

const ITEMS = [
  { id: "r1", title: "Pasta Carbonara", domain: "example.com", image_url: null, total_time: 30, cook_time: null, yields: null, cuisine: null, category: null, tags: [] },
  { id: "r2", title: "Chicken Tikka", domain: "food.com", image_url: null, total_time: 45, cook_time: null, yields: null, cuisine: null, category: null, tags: [] },
];

function renderShelf(props = {}) {
  return render(
    <MemoryRouter>
      <RecipeShelf title="Fig. 004 — Trending this week" items={ITEMS} {...props} />
    </MemoryRouter>,
  );
}

describe("RecipeShelf", () => {
  it("renders the figure label", () => {
    renderShelf();
    expect(screen.getByText(/Fig\. 004/)).toBeDefined();
  });

  it("renders the shelf title", () => {
    renderShelf();
    expect(screen.getByText("Trending this week")).toBeDefined();
  });

  it("renders See all link", () => {
    renderShelf();
    expect(screen.getByText(/See all/)).toBeDefined();
  });

  it("renders recipe thumbnails with titles below", () => {
    renderShelf();
    expect(screen.getAllByText(/Pasta/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Chicken/).length).toBeGreaterThan(0);
  });

  it("shows rank badges when ranked prop is true", () => {
    renderShelf({ ranked: true });
    expect(screen.getByText("01")).toBeDefined();
    expect(screen.getByText("02")).toBeDefined();
  });

  it("shows time badges", () => {
    renderShelf();
    expect(screen.getAllByText("30m").length).toBeGreaterThan(0);
    expect(screen.getAllByText("45m").length).toBeGreaterThan(0);
  });

  it("links to recipe detail pages", () => {
    renderShelf();
    const links = screen.getAllByRole("link");
    const recipeLinks = links.filter((l) => l.getAttribute("href")?.startsWith("/recipe/"));
    expect(recipeLinks.length).toBe(2);
  });
});
