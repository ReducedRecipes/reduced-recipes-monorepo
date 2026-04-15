import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import RecipePage from "../RecipePage";
import type { RecipeDocument } from "@rr/shared/types";

vi.mock("../../lib/api", () => ({
  fetchRecipe: vi.fn(),
}));

import { fetchRecipe } from "../../lib/api";
const mockFetchRecipe = vi.mocked(fetchRecipe);

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
  instructions: ["Preheat oven to 350F", "Mix dry ingredients", "Bake for 40 minutes"],
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
  document.head.querySelectorAll('script[type="application/ld+json"]').forEach((s) => s.remove());
  document.head.querySelectorAll('meta[name="description"], meta[property^="og:"], link[rel="canonical"]').forEach((el) => el.remove());
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
    expect(screen.getByText("By Chef Test")).toBeDefined();
    expect(screen.getByText("example.com")).toBeDefined();
    expect(screen.getByText("1 hr")).toBeDefined();
    expect(screen.getByText("8 servings")).toBeDefined();
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

  it("highlights instruction step on click", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    const step = screen.getByText("Preheat oven to 350F");
    fireEvent.click(step);
    expect(step.className).toContain("bg-amber-100");
    fireEvent.click(step);
    expect(step.className).not.toContain("bg-amber-100");
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
    const sourceLink = screen.getByText("View Full Recipe on example.com");
    expect(sourceLink.getAttribute("href")).toBe("https://example.com/recipe");
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
    const script = document.head.querySelector('script[type="application/ld+json"]');
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

    const ogDesc = document.head.querySelector('meta[property="og:description"]');
    expect(ogDesc).not.toBeNull();

    const ogType = document.head.querySelector('meta[property="og:type"]');
    expect(ogType).not.toBeNull();
    expect(ogType!.getAttribute("content")).toBe("article");

    const ogImage = document.head.querySelector('meta[property="og:image"]');
    expect(ogImage).not.toBeNull();
    expect(ogImage!.getAttribute("content")).toBe("https://example.com/cake.jpg");

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
    const { container } = renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.queryByRole("img")).toBeNull();
    expect(container.querySelector(".bg-gray-200")).toBeDefined();
  });
});
