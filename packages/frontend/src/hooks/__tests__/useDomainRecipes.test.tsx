import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useDomainRecipes } from "../useDomainRecipes";
import type { RecipeListResponse } from "../../lib/api";

vi.mock("../../lib/api", () => ({
  fetchDomainRecipes: vi.fn(),
}));

import { fetchDomainRecipes } from "../../lib/api";
const mockFetchDomainRecipes = vi.mocked(fetchDomainRecipes);

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
      title: "Domain Recipe",
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
  next_cursor: null,
};

describe("useDomainRecipes", () => {
  it("returns data on success", async () => {
    mockFetchDomainRecipes.mockResolvedValueOnce(mockResponse);
    const { result } = renderHook(() => useDomainRecipes("example.com"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockResponse);
    expect(mockFetchDomainRecipes).toHaveBeenCalledWith("example.com");
  });

  it("isLoading is true initially", () => {
    mockFetchDomainRecipes.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useDomainRecipes("example.com"), {
      wrapper: createWrapper(),
    });
    expect(result.current.isLoading).toBe(true);
  });

  it("query is disabled when domain is empty string", () => {
    const { result } = renderHook(() => useDomainRecipes(""), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(mockFetchDomainRecipes).not.toHaveBeenCalled();
  });
});
