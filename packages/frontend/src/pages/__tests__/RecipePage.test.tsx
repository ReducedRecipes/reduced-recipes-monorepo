import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import RecipePage from "../RecipePage";
import type { RecipeDocument } from "@rr/shared/types";

const mockAuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  isNewUser: false,
  logout: vi.fn(),
  login: vi.fn(),
  checkAuth: vi.fn(),
};

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

const mockShoppingListsState: {
  lists: any[];
  isLoading: boolean;
  createList: ReturnType<typeof vi.fn>;
  createListAsync: ReturnType<typeof vi.fn>;
  updateList: ReturnType<typeof vi.fn>;
  deleteList: ReturnType<typeof vi.fn>;
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
} = {
  lists: [],
  isLoading: false,
  createList: vi.fn(),
  createListAsync: vi.fn(),
  updateList: vi.fn(),
  deleteList: vi.fn(),
  isCreating: false,
  isUpdating: false,
  isDeleting: false,
};

vi.mock("../../hooks/useShoppingLists", () => ({
  useShoppingLists: () => mockShoppingListsState,
}));

vi.mock("../../components/BookmarkButton", () => ({
  BookmarkButton: () => <button data-testid="bookmark-btn">Bookmark</button>,
}));

vi.mock("../../lib/api", () => ({
  fetchRecipe: vi.fn(),
  fetchRecipes: vi.fn().mockResolvedValue({ items: [], next_cursor: null }),
  addRecipeToList: vi.fn(),
}));

import { fetchRecipe, addRecipeToList } from "../../lib/api";
const mockFetchRecipe = vi.mocked(fetchRecipe);
const mockAddRecipeToList = vi.mocked(addRecipeToList);

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

  it("does not render shopping list pill when not authenticated", async () => {
    renderPage();
    await screen.findByText("Chocolate Cake");
    expect(screen.queryByText("+ Shopping list")).toBeNull();
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

  describe("Shopping list picker (authenticated)", () => {
    const mockList = (overrides: Record<string, unknown> = {}) => ({
      id: "list-1",
      user_id: "user-1",
      collection_id: null,
      name: "Groceries",
      is_default: 1,
      share_token: null,
      share_expires_at: null,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      item_count: 3,
      recipe_count: 1,
      ...overrides,
    });

    beforeEach(() => {
      mockAuthState.isAuthenticated = true;
      mockShoppingListsState.lists = [];
      mockShoppingListsState.createListAsync = vi.fn().mockResolvedValue({ id: "new-1" });
      mockAddRecipeToList.mockResolvedValue({ items: [] });
    });

    afterEach(() => {
      mockAuthState.isAuthenticated = false;
      mockShoppingListsState.lists = [];
      vi.useRealTimers();
    });

    it("renders pill when authenticated", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      expect(screen.getByText("+ Shopping list")).toBeDefined();
    });

    it("opens picker dropdown on pill click", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      expect(screen.getByText("Choose a list")).toBeDefined();
    });

    it("shows + Create new list with zero lists", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      expect(screen.getByText("+ Create new list")).toBeDefined();
    });

    it("shows + Create new list alongside existing lists", async () => {
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      expect(screen.getByText("Groceries")).toBeDefined();
      expect(screen.getByText("+ Create new list")).toBeDefined();
    });

    it("expands inline input on + Create new list click", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      expect(screen.getByPlaceholderText("Chocolate Cake")).toBeDefined();
      expect(screen.getByText("Create & add")).toBeDefined();
    });

    it("submits with recipe title when input is empty", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      fireEvent.click(screen.getByText("Create & add"));

      await waitFor(() => {
        expect(mockShoppingListsState.createListAsync).toHaveBeenCalledWith({
          name: "Chocolate Cake",
        });
      });
    });

    it("submits with custom name when input is filled", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      fireEvent.change(screen.getByPlaceholderText("Chocolate Cake"), {
        target: { value: "Weekend Baking" },
      });
      fireEvent.click(screen.getByText("Create & add"));

      await waitFor(() => {
        expect(mockShoppingListsState.createListAsync).toHaveBeenCalledWith({
          name: "Weekend Baking",
        });
      });
    });

    it("submits on Enter key in name input", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      const input = screen.getByPlaceholderText("Chocolate Cake");
      fireEvent.keyDown(input, { key: "Enter" });

      await waitFor(() => {
        expect(mockShoppingListsState.createListAsync).toHaveBeenCalled();
      });
    });

    it("clicking existing list cancels creation mode", async () => {
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      expect(screen.getByPlaceholderText("Chocolate Cake")).toBeDefined();

      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText("Chocolate Cake")).toBeNull();
      });
    });

    it("adds recipe to existing list and shows confirmation", async () => {
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(mockAddRecipeToList).toHaveBeenCalledWith("list-1", {
          recipe_id: "abc123",
          ingredients: ["2 cups flour", "1 cup sugar", "3 eggs"],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Ingredients added to Groceries/)).toBeDefined();
        expect(screen.getByText("View →")).toBeDefined();
      });
    });

    it("pill stays visible after adding to list", async () => {
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(screen.getByText(/Ingredients added to Groceries/)).toBeDefined();
      });

      expect(screen.getByText("+ Shopping list")).toBeDefined();
    });

    it("confirmation auto-dismisses after 3 seconds", async () => {
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(screen.getByText(/Ingredients added to Groceries/)).toBeDefined();
      });

      // The confirmation uses a 3s setTimeout — verify it eventually disappears
      await waitFor(
        () => {
          expect(screen.queryByText(/Ingredients added to Groceries/)).toBeNull();
        },
        { timeout: 5000 },
      );
    });

    it("can re-open picker after adding", async () => {
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(screen.getByText(/Ingredients added to Groceries/)).toBeDefined();
      });

      fireEvent.click(screen.getByText("+ Shopping list"));
      expect(screen.getByText("Choose a list")).toBeDefined();
    });

    it("shows duplicate indicator on lists containing current recipe", async () => {
      mockShoppingListsState.lists = [
        mockList({ recipe_ids: "abc123,other-recipe" }),
      ];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      expect(screen.getByText("✓ Ingredients added")).toBeDefined();
    });

    it("does not show duplicate indicator when recipe is not in list", async () => {
      mockShoppingListsState.lists = [
        mockList({ recipe_ids: "other-recipe" }),
      ];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      expect(screen.queryByText("✓ Ingredients added")).toBeNull();
    });

    it("shows inline error on add failure", async () => {
      mockAddRecipeToList.mockRejectedValueOnce(new Error("Network error"));
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(screen.getByText("Something went wrong")).toBeDefined();
        expect(screen.getByText("Try again")).toBeDefined();
      });

      expect(screen.getByText("Choose a list")).toBeDefined();
    });

    it("shows inline error on create failure", async () => {
      mockShoppingListsState.createListAsync = vi
        .fn()
        .mockRejectedValue(new Error("Create failed"));
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      fireEvent.change(screen.getByPlaceholderText("Chocolate Cake"), {
        target: { value: "My List" },
      });
      fireEvent.click(screen.getByText("Create & add"));

      await waitFor(() => {
        expect(screen.getByText("Something went wrong")).toBeDefined();
      });

      expect(
        (screen.getByPlaceholderText("Chocolate Cake") as HTMLInputElement)
          .value,
      ).toBe("My List");
    });

    it("retry button retries failed add operation", async () => {
      mockAddRecipeToList
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({ items: [] });
      mockShoppingListsState.lists = [mockList()];
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("Groceries"));

      await waitFor(() => {
        expect(screen.getByText("Try again")).toBeDefined();
      });

      fireEvent.click(screen.getByText("Try again"));

      await waitFor(() => {
        expect(mockAddRecipeToList).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(screen.getByText(/Ingredients added to Groceries/)).toBeDefined();
      });
    });

    it("creates list and adds recipe in one flow", async () => {
      renderPage();
      await screen.findByText("Chocolate Cake");
      fireEvent.click(screen.getByText("+ Shopping list"));
      fireEvent.click(screen.getByText("+ Create new list"));
      fireEvent.click(screen.getByText("Create & add"));

      await waitFor(() => {
        expect(mockShoppingListsState.createListAsync).toHaveBeenCalledWith({
          name: "Chocolate Cake",
        });
        expect(mockAddRecipeToList).toHaveBeenCalledWith("new-1", {
          recipe_id: "abc123",
          ingredients: ["2 cups flour", "1 cup sugar", "3 eggs"],
        });
      });

      await waitFor(() => {
        expect(screen.getByText(/Ingredients added to Chocolate Cake/)).toBeDefined();
      });
    });
  });
});
