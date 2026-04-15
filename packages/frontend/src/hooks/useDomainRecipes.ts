import { useQuery } from "@tanstack/react-query";
import { fetchDomainRecipes } from "../lib/api";
import type { RecipeListResponse } from "../lib/api";
import type { UseQueryResult } from "@tanstack/react-query";

export function useDomainRecipes(domain: string): UseQueryResult<RecipeListResponse> {
  return useQuery({
    queryKey: ["domain-recipes", domain],
    queryFn: () => fetchDomainRecipes(domain),
    enabled: !!domain,
  });
}
