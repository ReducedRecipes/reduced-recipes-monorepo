import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSearch } from "../useSearch";
import type { RecipeSummary } from "@rr/shared";

vi.mock("../../lib/api", () => ({
  searchRecipes: vi.fn(),
}));

import { searchRecipes } from "../../lib/api";
const mockSearchRecipes = vi.mocked(searchRecipes);

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

const mockResults: RecipeSummary[] = [
  {
    id: "r1",
    title: "Pasta Carbonara",
    domain: "example.com",
    image_url: "https://example.com/img.jpg",
    total_time: 30,
    cook_time: 20,
    yields: "4 servings",
    cuisine: "Italian",
    category: "Main",
    tags: ["pasta"],
  },
];

describe("useSearch", () => {
  it("fetches search results for a query", async () => {
    mockSearchRecipes.mockResolvedValueOnce(mockResults);
    const { result } = renderHook(() => useSearch("pasta"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResults);
    expect(mockSearchRecipes).toHaveBeenCalledWith("pasta");
  });

  it("isLoading is true initially for valid query", () => {
    mockSearchRecipes.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useSearch("pasta"), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("query is disabled when query string is too short", () => {
    const { result } = renderHook(() => useSearch("p"), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(mockSearchRecipes).not.toHaveBeenCalled();
  });

  it("query is disabled when query string is empty", () => {
    const { result } = renderHook(() => useSearch(""), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(mockSearchRecipes).not.toHaveBeenCalled();
  });
});
