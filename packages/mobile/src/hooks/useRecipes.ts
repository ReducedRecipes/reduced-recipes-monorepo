import { useInfiniteQuery } from "@tanstack/react-query";
import { api, type RecipeListParams } from "../lib/api";

/**
 * Fetch paginated recipe list with cursor-based pagination.
 */
export function useRecipes(params: Omit<RecipeListParams, "cursor"> = {}) {
  return useInfiniteQuery({
    queryKey: ["recipes", params],
    queryFn: ({ pageParam }) => api.recipes.list({ ...params, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
  });
}
