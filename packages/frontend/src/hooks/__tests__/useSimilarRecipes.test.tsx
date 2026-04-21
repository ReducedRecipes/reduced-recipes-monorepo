import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { useSimilarRecipes } from "../useSimilarRecipes";
import type { RecipeSummary } from "@rr/shared";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "../../lib/api";
const mockApiFetch = vi.mocked(apiFetch);

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

const mockItems: RecipeSummary[] = [
  {
    id: "r2",
    title: "Spaghetti Aglio e Olio",
    domain: "example.com",
    image_url: null,
    total_time: 20,
    cook_time: 15,
    yields: "2 servings",
    cuisine: "Italian",
    category: "Pasta",
    tags: [],
  },
];

describe("useSimilarRecipes", () => {
  it("fetches similar recipes for a given id", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: mockItems });
    const { result } = renderHook(() => useSimilarRecipes("r1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.items).toEqual(mockItems);
    expect(mockApiFetch).toHaveBeenCalledWith("/search/similar/r1?limit=8");
  });

  it("respects custom limit", async () => {
    mockApiFetch.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useSimilarRecipes("r1", 4), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith("/search/similar/r1?limit=4");
  });

  it("is disabled when id is empty", () => {
    const { result } = renderHook(() => useSimilarRecipes(""), {
      wrapper: createWrapper(),
    });
    expect(result.current.isFetching).toBe(false);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});
