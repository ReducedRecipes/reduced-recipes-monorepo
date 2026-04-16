import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export interface SearchFilters {
  tag?: string;
  cuisine?: string;
  domain?: string;
  max_time?: number;
}

const PAGE_SIZE = 20;

/**
 * Search recipes with infinite scroll pagination.
 */
export function useSearch(query: string, filters: SearchFilters = {}) {
  const trimmed = query.trim();

  return useInfiniteQuery({
    queryKey: ["search", trimmed, filters],
    queryFn: ({ pageParam = 0 }) =>
      api.recipes.search(trimmed, PAGE_SIZE, pageParam as number),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.has_more) return undefined;
      const totalFetched = allPages.reduce((sum, p) => sum + (p?.items?.length ?? 0), 0);
      return totalFetched;
    },
    enabled: trimmed.length >= 2,
  });
}
