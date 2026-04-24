import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || 'https://reducedrecipes.com'}/api/v1`;

async function fetchHeartStatus(recipeId: string): Promise<{ hearted: boolean; count: number }> {
  const res = await fetch(`${BASE_URL}/recipes/${encodeURIComponent(recipeId)}/heart`, {
    headers: { 'X-Client': 'rr-mobile/1.0' },
  });
  if (!res.ok) return { hearted: false, count: 0 };
  return res.json();
}

async function heartRecipe(recipeId: string): Promise<{ count: number }> {
  const res = await fetch(`${BASE_URL}/recipes/${encodeURIComponent(recipeId)}/heart`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client': 'rr-mobile/1.0' },
  });
  if (!res.ok) throw new Error('Failed to heart recipe');
  return res.json();
}

async function unheartRecipe(recipeId: string): Promise<{ count: number }> {
  const res = await fetch(`${BASE_URL}/recipes/${encodeURIComponent(recipeId)}/heart`, {
    method: 'DELETE',
    headers: { 'X-Client': 'rr-mobile/1.0' },
  });
  if (!res.ok) throw new Error('Failed to unheart recipe');
  return res.json();
}

export function useHeart(recipeId: string) {
  const queryClient = useQueryClient();
  const queryKey = ['heart', recipeId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchHeartStatus(recipeId),
    enabled: !!recipeId,
    staleTime: 5 * 60 * 1000,
  });

  const hearted = data?.hearted ?? false;
  const count = data?.count ?? 0;

  const mutation = useMutation({
    mutationFn: () => (hearted ? unheartRecipe(recipeId) : heartRecipe(recipeId)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<{ hearted: boolean; count: number }>(queryKey);
      queryClient.setQueryData(queryKey, {
        hearted: !hearted,
        count: hearted ? Math.max(0, count - 1) : count + 1,
      });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) queryClient.setQueryData(queryKey, context.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    hearted,
    count,
    toggle: () => mutation.mutate(),
    isLoading: mutation.isPending,
  };
}
