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
      <RecipeShelf label="Test shelf" items={ITEMS} {...props} />
    </MemoryRouter>,
  );
}

describe("RecipeShelf", () => {
  it("renders the label via Rule", () => {
    renderShelf();
    expect(screen.getByText("Test shelf")).toBeDefined();
  });

  it("renders recipe thumbnails", () => {
    renderShelf();
    expect(screen.getByText(/Pasta/)).toBeDefined();
    expect(screen.getByText(/Chicken/)).toBeDefined();
  });

  it("shows rank numbers when ranked prop is true", () => {
    renderShelf({ ranked: true });
    expect(screen.getByText("#1")).toBeDefined();
    expect(screen.getByText("#2")).toBeDefined();
  });

  it("does not show rank numbers by default", () => {
    renderShelf();
    expect(screen.queryByText("#1")).toBeNull();
  });

  it("links to recipe detail pages", () => {
    renderShelf();
    const links = screen.getAllByRole("link");
    expect(links[0]!.getAttribute("href")).toBe("/recipe/r1");
    expect(links[1]!.getAttribute("href")).toBe("/recipe/r2");
  });
});
