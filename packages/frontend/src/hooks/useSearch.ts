import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { RecipeSummary } from "@rr/shared";
import { buildQuery } from "@rr/shared/build-query";

interface SearchPage {
  items: RecipeSummary[];
  has_more: boolean;
  search_mode?: string;
}

const PAGE_SIZE = 24;

export type SearchMode = "keyword" | "semantic" | "hybrid";

export function useSearch(query: string, mode: SearchMode = "hybrid") {
  return useInfiniteQuery({
    queryKey: ["search", query, mode],
    queryFn: ({ pageParam = 0 }) =>
      apiFetch<SearchPage>(
        `/search${buildQuery({ q: query, limit: PAGE_SIZE, offset: pageParam as number, mode })}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.has_more) return undefined;
      const totalFetched = allPages.reduce((sum, p) => sum + p.items.length, 0);
      return totalFetched;
    },
    enabled: query.length >= 2,
  });
}
