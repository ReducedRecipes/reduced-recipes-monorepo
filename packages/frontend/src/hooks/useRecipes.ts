import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchRecipes } from "../lib/api";
import type { RecipeListParams } from "../lib/api";

export function useRecipes(params: RecipeListParams = {}) {
  return useInfiniteQuery({
    queryKey: ["recipes", params],
    queryFn: ({ pageParam }) =>
      fetchRecipes(pageParam ? { ...params, cursor: pageParam } : params),
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}
