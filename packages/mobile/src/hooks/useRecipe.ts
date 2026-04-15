import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

/**
 * Fetch a single recipe by ID.
 */
export function useRecipe(id: string) {
  return useQuery({
    queryKey: ["recipe", id],
    queryFn: () => api.recipes.get(id),
    enabled: !!id,
  });
}
