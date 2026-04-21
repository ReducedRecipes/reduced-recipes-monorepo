import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import RecipePage from "../RecipePage";
import type { RecipeDocument } from "@rr/shared/types";

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

vi.mock("../../components/BookmarkButton", () => ({
  BookmarkButton: () => <button data-testid="bookmark-btn">Bookmark</button>,
}));

vi.mock("../../lib/api", () => ({
  fetchRecipe: vi.fn(),
  heartRecipe: vi.fn(),
  unheartRecipe: vi.fn(),
}));

import { fetchRecipe, heartRecipe, unheartRecipe } from "../../lib/api";
const mockFetchRecipe = vi.mocked(fetchRecipe);
const mockHeartRecipe = vi.mocked(heartRecipe);
const mockUnheartRecipe = vi.mocked(unheartRecipe);

const mockRecipe: RecipeDocument = {
  id: "abc123",
  source_url: "https://example.com/recipe",
  domain: "example.com",
  title: "Chocolate Cake",
  image_url: "https://example.com/cake.jpg",
  author: "Chef Test",
  yields: "8 servings",
  prep_time: 20,
  cook_time: 40,
  total_time: 60,
  ingredients: ["2 cups flour", "1 cup sugar", "3 eggs"],
  instructions: [
    "Preheat oven to 350F",
    "Mix dry ingredients",
    "Bake for 40 minutes",
  ],
  tags: ["dessert", "chocolate"],
  cuisine: "American",
  category: "Dessert",
  keywords: ["cake", "chocolate"],
  schema_valid: true,
  extracted_at: "2024-01-01T00:00:00Z",
  last_checked: "2024-01-01T00:00:00Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  document.title = "";
  document
    .head.querySelectorAll('script[type="application/ld+json"]')
    .forEach((s) => s.remove());
  document
    .head.querySelectorAll(
      'meta[name="description"], meta[property^="og:"], link[rel="canonical"]',
    )
    .forEach((el) => el.remove());
});

function renderPage(id = "abc123") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/recipe/${id}`]}>
        <Routes>
          <Route path="/recipe/:id" element={<RecipePage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("RecipePage", () => {
  beforeEach(() => {
    mockFetchRecipe.mockResolvedValue(mockRecipe);
  });

  it("shows loading spinner initially", () => {
    mockFetchRecipe.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(document.querySelector(".animate-spin")).toBeDefined();
  });

  it("renders recipe title and metadata", async () => {
    renderPage();
    expect(await screen.findByText("Chocolate Cake")).toBeDefined();
    expect(screen.getByText("Chef Test")).toBeDefined();
    expect(screen.getByText("example.com")).toBeDefined();
    // Yields "8 servings" is parsed to "8" in the stat rail
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
  });

  it("renders ingredients with checkboxes", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("2 cups flour")).toBeDefined();
    expect(screen.getByText("1 cup sugar")).toBeDefined();
    expect(screen.getByText("3 eggs")).toBeDefined();
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes.length).toBe(3);
  });

  it("toggles ingredient checkbox", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const checkboxes = screen.getAllByRole("checkbox");
    const firstCheckbox = checkboxes[0] as HTMLInputElement;
    expect(firstCheckbox).toBeDefined();
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox.checked).toBe(true);
    fireEvent.click(firstCheckbox);
    expect(firstCheckbox.checked).toBe(false);
  });

  it("renders numbered instructions", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("Preheat oven to 350F")).toBeDefined();
    expect(screen.getByText("Mix dry ingredients")).toBeDefined();
    expect(screen.getByText("Bake for 40 minutes")).toBeDefined();
  });

  it("toggles step completion on click", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    // Click the step number button (01) to mark done
    const stepBtn = screen.getByText("01");
    fireEvent.click(stepBtn);
    expect(stepBtn.textContent).toBe("✓");
    fireEvent.click(stepBtn);
    expect(stepBtn.textContent).toBe("01");
  });

  it("renders tags as links", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const tagLink = screen.getByText("dessert");
    expect(tagLink.closest("a")?.getAttribute("href")).toBe("/tag/dessert");
  });

  it("renders source link", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const sourceLink = screen.getByText("View original on example.com");
    expect(sourceLink.getAttribute("href")).toBe(
      "https://example.com/recipe",
    );
    expect(sourceLink.getAttribute("target")).toBe("_blank");
    expect(sourceLink.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("sets document title", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(document.title).toBe("Chocolate Cake - ReducedRecipes");
  });

  it("injects Schema.org ld+json", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const script = document.head.querySelector(
      'script[type="application/ld+json"]',
    );
    expect(script).not.toBeNull();
    const schema = JSON.parse(script!.textContent!);
    expect(schema["@type"]).toBe("Recipe");
    expect(schema.name).toBe("Chocolate Cake");
  });

  it("adds SEO meta tags to document head", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");

    const desc = document.head.querySelector('meta[name="description"]');
    expect(desc).not.toBeNull();
    expect(desc!.getAttribute("content")).toContain("Recipe for Chocolate Cake");

    const ogTitle = document.head.querySelector('meta[property="og:title"]');
    expect(ogTitle).not.toBeNull();
    expect(ogTitle!.getAttribute("content")).toBe("Chocolate Cake");

    const ogDesc = document.head.querySelector(
      'meta[property="og:description"]',
    );
    expect(ogDesc).not.toBeNull();

    const ogType = document.head.querySelector('meta[property="og:type"]');
    expect(ogType).not.toBeNull();
    expect(ogType!.getAttribute("content")).toBe("article");

    const ogImage = document.head.querySelector('meta[property="og:image"]');
    expect(ogImage).not.toBeNull();
    expect(ogImage!.getAttribute("content")).toBe(
      "https://example.com/cake.jpg",
    );

    const canonical = document.head.querySelector('link[rel="canonical"]');
    expect(canonical).not.toBeNull();
  });

  it("shows error message on failure", async () => {
    mockFetchRecipe.mockRejectedValueOnce(new Error("Not found"));
    renderPage();
    expect(await screen.findByText(/Failed to load recipe/)).toBeDefined();
  });

  it("renders placeholder when image_url is null", async () => {
    mockFetchRecipe.mockResolvedValueOnce({ ...mockRecipe, image_url: null });
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders stat rail with recipe stats", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("Total")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
    // "Ingredients" appears both as Rule label and Stat label
    expect(screen.getAllByText("Ingredients").length).toBeGreaterThan(0);
    expect(screen.getByText("Steps")).toBeDefined();
    expect(screen.getByText("1h")).toBeDefined(); // total_time = 60
    expect(screen.getAllByText("3").length).toBeGreaterThan(0); // 3 ingredients or steps
  });

  it("renders servings adjuster in sticky controls", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    // "Servings" appears in both stat rail and sticky controls
    expect(screen.getAllByText("Servings").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
    expect(screen.getByText("US")).toBeDefined();
    expect(screen.getByText("Metric")).toBeDefined();
    expect(screen.getByText("Cook mode")).toBeDefined();
  });

  it("adjusts servings with +/- buttons", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const plusBtn = screen.getByText("+");
    fireEvent.click(plusBtn);
    expect(screen.getByText("9")).toBeDefined();
    const minusBtn = screen.getByText("−");
    fireEvent.click(minusBtn);
    expect(screen.getAllByText("8").length).toBeGreaterThan(0);
  });

  it("renders back link", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const backLink = screen.getByText("← Back to index");
    expect(backLink.closest("a")?.getAttribute("href")).toBe("/");
  });

  it("renders recipe id label", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("Recipe #abc123")).toBeDefined();
  });

  it("renders filed-under card with author and source", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("Filed under")).toBeDefined();
    expect(screen.getByText("Author")).toBeDefined();
    expect(screen.getByText("Source")).toBeDefined();
  });

  it("opens cook mode and navigates steps", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const cookBtn = screen.getByText("Cook mode");
    fireEvent.click(cookBtn);
    expect(screen.getByText("Step 1 of 3")).toBeDefined();
    // Step text appears in both main view and cook mode overlay
    expect(screen.getAllByText("Preheat oven to 350F").length).toBeGreaterThanOrEqual(1);

    // Navigate to next step
    const nextBtn = screen.getByText("Next →");
    fireEvent.click(nextBtn);
    expect(screen.getByText("Step 2 of 3")).toBeDefined();
    expect(screen.getAllByText("Mix dry ingredients").length).toBeGreaterThanOrEqual(1);
  });

  it("renders heart button", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByRole("button", { name: "Heart recipe" })).toBeDefined();
  });

  it("shows vote count when recipe has votes", async () => {
    mockFetchRecipe.mockResolvedValueOnce({ ...mockRecipe, vote_count: 42 });
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("42")).toBeDefined();
  });

  it("optimistically toggles heart state on click", async () => {
    mockHeartRecipe.mockResolvedValue({ hearted: true, vote_count: 1 });
    renderPage();
    await screen.findByText("Chocolate Cake");
    const heartBtn = screen.getByRole("button", { name: "Heart recipe" });
    fireEvent.click(heartBtn);
    expect(mockHeartRecipe).toHaveBeenCalledWith("abc123");
  });

  it("calls unheartRecipe when un-hearting", async () => {
    mockHeartRecipe.mockResolvedValue({ hearted: true, vote_count: 1 });
    mockUnheartRecipe.mockResolvedValue({ hearted: false, vote_count: 0 });
    renderPage();
    await screen.findByText("Chocolate Cake");
    const heartBtn = screen.getByRole("button", { name: "Heart recipe" });
    fireEvent.click(heartBtn);
    await screen.findByRole("button", { name: "Un-heart recipe" });
    fireEvent.click(screen.getByRole("button", { name: "Un-heart recipe" }));
    expect(mockUnheartRecipe).toHaveBeenCalledWith("abc123");
  });

  it("shows reduction callout when available", async () => {
    mockFetchRecipe.mockResolvedValueOnce({
      ...mockRecipe,
      reduction: {
        original_words: 2500,
        recipe_words: 150,
        words_removed: 2350,
        bloat_percent: 94,
        ads_detected: 12,
      },
    });
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.getByText("Why this works")).toBeDefined();
    // The callout text contains reduction stats across the paragraph
    const callout = screen.getByText(/Just the recipe/);
    expect(callout).toBeDefined();
    expect(callout.textContent).toMatch(/94%/);
  });
});
