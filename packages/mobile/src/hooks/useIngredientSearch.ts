import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { RecipeSummary } from "@rr/shared";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || "https://reducedrecipes.com"}/api/v1`;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/**
 * Autocomplete ingredient suggestions. Debounces the query by 300ms.
 */
export function useIngredientSuggest(query: string) {
  const debouncedQuery = useDebounced(query.trim(), 300);

  return useQuery<string[]>({
    queryKey: ["ingredient-suggest", debouncedQuery],
    queryFn: async () => {
      const res = await fetch(
        `${BASE_URL}/ingredients/suggest?q=${encodeURIComponent(debouncedQuery)}`,
        { headers: { "X-Client": "rr-mobile/1.0" } },
      );
      if (!res.ok) return [];
      const data = await res.json();
      // API returns { items: [{ name: string, count: number }] }
      const items = Array.isArray(data) ? data : data.items ?? [];
      return items.map((item: unknown) =>
        typeof item === "string" ? item : (item as { name: string }).name,
      );
    },
    enabled: debouncedQuery.length >= 2,
    staleTime: 60_000,
  });
}

export interface IngredientSearchItem {
  id: string;
  title: string;
  domain: string;
  image_url: string | null;
  total_time: number | null;
  cook_time: number | null;
  yields: string | null;
  cuisine: string | null;
  category: string | null;
  match: {
    have: number;
    total: number;
    missing: string[];
  };
}

export interface IngredientSearchResponse {
  items: IngredientSearchItem[];
  has_more: boolean;
}

/**
 * Search recipes by ingredients the user has / doesn't have.
 * Only fires when explicitly enabled (after pressing "Find recipes").
 */
export function useIngredientSearch(
  have: string[],
  exclude: string[],
  enabled: boolean,
) {
  return useQuery<IngredientSearchResponse>({
    queryKey: ["ingredient-search", have, exclude],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (have.length) params.set("have", have.join(","));
      if (exclude.length) params.set("exclude", exclude.join(","));
      const res = await fetch(`${BASE_URL}/search/by-ingredients?${params}`, {
        headers: { "X-Client": "rr-mobile/1.0" },
      });
      if (!res.ok) {
        throw new Error(`Search failed: ${res.status}`);
      }
      return (await res.json()) as IngredientSearchResponse;
    },
    enabled: enabled && have.length > 0,
    staleTime: 30_000,
  });
}
