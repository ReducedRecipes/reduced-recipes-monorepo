import { useQuery } from '@tanstack/react-query';
import type { RecipeSummary } from '@rr/shared';

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || 'https://reducedrecipes.com'}/api/v1`;

async function fetchSimilar(recipeId: string, limit = 8): Promise<RecipeSummary[]> {
  const res = await fetch(
    `${BASE_URL}/search/similar/${encodeURIComponent(recipeId)}?limit=${limit}`,
    { headers: { 'X-Client': 'rr-mobile/1.0' } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.items ?? data ?? [];
}

export function useSimilarRecipes(recipeId: string, limit = 8) {
  return useQuery({
    queryKey: ['similar', recipeId, limit],
    queryFn: () => fetchSimilar(recipeId, limit),
    enabled: !!recipeId,
    staleTime: 10 * 60 * 1000,
  });
}
