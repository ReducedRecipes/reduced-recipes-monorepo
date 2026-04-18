import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { RecipeSummary } from "@rr/shared";
import { buildQuery } from "@rr/shared/build-query";

interface SearchPage {
  items: RecipeSummary[];
  has_more: boolean;
}

const PAGE_SIZE = 24;

export function useSearch(query: string) {
  return useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam = 0 }) =>
      apiFetch<SearchPage>(
        `/search${buildQuery({ q: query, limit: PAGE_SIZE, offset: pageParam as number })}`,
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
