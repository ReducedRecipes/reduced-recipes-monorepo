import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/auth.store';

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || 'https://reducedrecipes.com'}/api/v1`;

function getAuthHeaders(): Record<string, string> {
  const token = useAuthStore.getState().sessionToken;
  const headers: Record<string, string> = { 'X-Client': 'rr-mobile/1.0' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

interface HeartState {
  hearted: boolean;
  vote_count: number;
}

async function fetchHeartStatus(recipeId: string): Promise<HeartState> {
  const token = useAuthStore.getState().sessionToken;
  if (!token) return { hearted: false, vote_count: 0 };
  const res = await fetch(`${BASE_URL}/recipes/${encodeURIComponent(recipeId)}/heart`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) return { hearted: false, vote_count: 0 };
  const data = await res.json() as { hearted: boolean };
  return { hearted: data.hearted, vote_count: 0 };
}

async function heartRecipe(recipeId: string): Promise<HeartState> {
  const headers = getAuthHeaders();
  // Heart the recipe
  const res = await fetch(`${BASE_URL}/recipes/${encodeURIComponent(recipeId)}/heart`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error('Failed to heart recipe');
  // Also bookmark it to the default collection
  fetch(`${BASE_URL}/bookmarks`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ recipe_id: recipeId }),
  }).catch(() => {});
  return res.json() as Promise<HeartState>;
}

async function unheartRecipe(recipeId: string): Promise<HeartState> {
  const res = await fetch(`${BASE_URL}/recipes/${encodeURIComponent(recipeId)}/heart`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to unheart recipe');
  return res.json() as Promise<HeartState>;
}

export function useHeart(recipeId: string, initialVoteCount?: number) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const queryClient = useQueryClient();
  const queryKey = ['heart', recipeId];

  const { data } = useQuery({
    queryKey,
    queryFn: () => fetchHeartStatus(recipeId),
    enabled: !!recipeId && isAuthenticated,
    staleTime: 5 * 60 * 1000,
  });

  const hearted = data?.hearted ?? false;
  const count = data?.vote_count ?? initialVoteCount ?? 0;

  const mutation = useMutation({
    mutationFn: () => (hearted ? unheartRecipe(recipeId) : heartRecipe(recipeId)),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<HeartState>(queryKey);
      queryClient.setQueryData<HeartState>(queryKey, {
        hearted: !hearted,
        vote_count: hearted ? Math.max(0, count - 1) : count + 1,
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
    toggle: () => {
      if (!isAuthenticated) return;
      mutation.mutate();
    },
    isLoading: mutation.isPending,
  };
}
