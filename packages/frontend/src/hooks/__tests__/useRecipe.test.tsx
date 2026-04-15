import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useRecipe } from "../useRecipe";
import type { RecipeDocument } from "@rr/shared/types";

vi.mock("../../lib/api", () => ({
  fetchRecipe: vi.fn(),
}));

import { fetchRecipe } from "../../lib/api";
const mockFetchRecipe = vi.mocked(fetchRecipe);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const mockRecipe: RecipeDocument = {
  id: "abc123",
  source_url: "https://example.com/recipe",
  domain: "example.com",
  title: "Test Recipe",
  image_url: "https://example.com/img.jpg",
  author: "Chef Test",
  yields: "4 servings",
  prep_time: 15,
  cook_time: 30,
  total_time: 45,
  ingredients: ["1 cup flour", "2 eggs"],
  instructions: ["Mix ingredients", "Bake at 350F"],
  tags: ["baking"],
  cuisine: "American",
  category: "Dessert",
  keywords: ["easy", "baking"],
  schema_valid: true,
  extracted_at: "2024-01-01T00:00:00Z",
  last_checked: "2024-01-01T00:00:00Z",
};

describe("useRecipe", () => {
  it("fetches recipe by id", async () => {
    mockFetchRecipe.mockResolvedValueOnce(mockRecipe);
    const { result } = renderHook(() => useRecipe("abc123"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockRecipe);
    expect(mockFetchRecipe).toHaveBeenCalledWith("abc123");
  });

  it("does not fetch when id is empty", () => {
    const { result } = renderHook(() => useRecipe(""), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(mockFetchRecipe).not.toHaveBeenCalled();
  });
});
