import { useQuery } from "@tanstack/react-query";
import { fetchRecipe } from "../lib/api";

export function useRecipe(id: string) {
  return useQuery({
    queryKey: ["recipe", id],
    queryFn: () => fetchRecipe(id),
    enabled: !!id,
  });
}
