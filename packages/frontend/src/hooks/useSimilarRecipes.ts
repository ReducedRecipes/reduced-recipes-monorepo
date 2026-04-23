import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../lib/api";
import type { RecipeSummary } from "@rr/shared";

interface SimilarRecipesResponse {
  items: RecipeSummary[];
}

export function useSimilarRecipes(id: string, limit = 8) {
  return useQuery({
    queryKey: ["similar", id, limit],
    queryFn: () =>
      apiFetch<SimilarRecipesResponse>(`/search/similar/${id}?limit=${limit}`),
    enabled: !!id,
    staleTime: 1000 * 60 * 60, // 1 hour — similar recipes rarely change
  });
}
