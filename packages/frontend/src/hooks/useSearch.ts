import { useQuery } from "@tanstack/react-query";
import { searchRecipes } from "../lib/api";

export function useSearch(query: string) {
  return useQuery({
    queryKey: ["search", query],
    queryFn: () => searchRecipes(query),
    enabled: query.length >= 2,
  });
}
