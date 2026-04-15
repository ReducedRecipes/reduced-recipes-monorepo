import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { api } from "../lib/api";

export interface SearchFilters {
  tag?: string;
  cuisine?: string;
  domain?: string;
  max_time?: number;
}

/**
 * Search recipes with debounce-aware enabled flag (min 2 chars).
 */
export function useSearch(query: string, filters: SearchFilters = {}) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["search", trimmed, filters],
    queryFn: () => api.recipes.search(trimmed),
    enabled: trimmed.length >= 2,
    placeholderData: keepPreviousData,
  });
}
