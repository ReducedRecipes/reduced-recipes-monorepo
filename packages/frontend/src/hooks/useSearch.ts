import { useInfiniteQuery } from "@tanstack/react-query";
import { searchRecipes } from "../lib/api";

const PAGE_SIZE = 24;

export function useSearch(query: string) {
  return useInfiniteQuery({
    queryKey: ["search", query],
    queryFn: ({ pageParam = 0 }) => searchRecipes(query, PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) =>
      lastPage.has_more ? lastPageParam + PAGE_SIZE : undefined,
    enabled: query.length >= 2,
  });
}
