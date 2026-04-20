import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import RecipeCard from "../RecipeCard";
import type { RecipeSummary } from "@rr/shared/types";

vi.mock("../../lib/api", () => ({
  heartRecipe: vi.fn().mockResolvedValue({ hearted: true, vote_count: 1 }),
  unheartRecipe: vi.fn().mockResolvedValue({ hearted: false, vote_count: 0 }),
}));

afterEach(cleanup);

function renderCard(overrides: Partial<RecipeSummary> = {}) {
  const recipe: RecipeSummary = {
    id: "abc123",
    title: "Test Recipe",
    domain: "example.com",
    image_url: "https://example.com/img.jpg",
    total_time: 45,
    cook_time: 30,
    yields: "4 servings",
    cuisine: "Italian",
    category: "Main",
    tags: ["pasta"],
    ...overrides,
  };
  return render(
    <MemoryRouter>
      <RecipeCard recipe={recipe} />
    </MemoryRouter>
  );
}

describe("RecipeCard", () => {
  it("renders title, domain, and time", () => {
    renderCard();
    expect(screen.getByText("Test Recipe")).toBeDefined();
    expect(screen.getByText("example.com")).toBeDefined();
    expect(screen.getByText("45 min")).toBeDefined();
  });

  it("links to /recipe/:id", () => {
    renderCard();
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/recipe/abc123");
  });

  it("renders image with lazy loading when image_url is present", () => {
    renderCard();
    const img = screen.getByRole("img");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("src")).toBe("https://example.com/img.jpg");
  });

  it("renders placeholder div when image_url is null", () => {
    const { container } = renderCard({ image_url: null });
    expect(screen.queryByRole("img")).toBeNull();
    const placeholder = container.querySelector(".bg-gray-200");
    expect(placeholder).toBeDefined();
  });

  it("does not show time when total_time is null", () => {
    renderCard({ total_time: null });
    expect(screen.queryByText(/min/)).toBeNull();
    expect(screen.queryByText(/hr/)).toBeNull();
  });

  it("formats time over 60 minutes with hours", () => {
    renderCard({ total_time: 90 });
    expect(screen.getByText("1 hr 30 min")).toBeDefined();
  });

  it("formats exact hours without minutes", () => {
    renderCard({ total_time: 120 });
    expect(screen.getByText("2 hr")).toBeDefined();
  });

  it("renders heart button", () => {
    renderCard();
    expect(screen.getByRole("button", { name: /heart recipe/i })).toBeDefined();
  });

  it("shows vote count when vote_count is provided", () => {
    renderCard({ vote_count: 42 });
    expect(screen.getByText("42")).toBeDefined();
  });

  it("does not show vote count when vote_count is 0", () => {
    renderCard({ vote_count: 0 });
    expect(screen.queryByText("0")).toBeNull();
  });
});
