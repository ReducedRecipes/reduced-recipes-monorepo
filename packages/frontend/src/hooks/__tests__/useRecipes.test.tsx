import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useRecipes } from "../useRecipes";
import type { RecipeListResponse } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  fetchRecipes: vi.fn(),
}));

import { fetchRecipes } from "../../lib/api";
const mockFetchRecipes = vi.mocked(fetchRecipes);

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

const mockResponse: RecipeListResponse = {
  items: [
    {
      id: "r1",
      title: "Test Recipe",
      domain: "example.com",
      image_url: "https://example.com/img.jpg",
      total_time: 30,
      cook_time: 20,
      yields: "4 servings",
      cuisine: "Italian",
      category: "Main",
      tags: ["pasta"],
    },
  ],
  next_cursor: "cursor-abc",
};

const emptyResponse: RecipeListResponse = {
  items: [],
  next_cursor: null,
};

describe("useRecipes", () => {
  it("fetches recipes with no params by default", async () => {
    mockFetchRecipes.mockResolvedValueOnce(mockResponse);
    const { result } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]).toEqual(mockResponse);
    expect(mockFetchRecipes).toHaveBeenCalledWith({});
  });

  it("fetches recipes with tag filter", async () => {
    mockFetchRecipes.mockResolvedValueOnce(mockResponse);
    const { result } = renderHook(() => useRecipes({ tag: "pasta" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pages[0]).toEqual(mockResponse);
    expect(mockFetchRecipes).toHaveBeenCalledWith({ tag: "pasta" });
  });

  it("fetches recipes with cuisine filter", async () => {
    mockFetchRecipes.mockResolvedValueOnce(mockResponse);
    const { result } = renderHook(() => useRecipes({ cuisine: "Italian" }), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockFetchRecipes).toHaveBeenCalledWith({ cuisine: "Italian" });
  });

  it("isLoading is true initially", () => {
    mockFetchRecipes.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("hasNextPage is true when next_cursor exists", async () => {
    mockFetchRecipes.mockResolvedValueOnce(mockResponse);
    const { result } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(true);
  });

  it("hasNextPage is false when next_cursor is null", async () => {
    mockFetchRecipes.mockResolvedValueOnce(emptyResponse);
    const { result } = renderHook(() => useRecipes(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.hasNextPage).toBe(false);
  });
});
