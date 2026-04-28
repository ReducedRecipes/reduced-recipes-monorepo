import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRecipes } from '@/hooks/useRecipes';
import { BrowseListScreen } from '@/components/BrowseListScreen';

export default function DomainScreen() {
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const query = useRecipes({ domain });
  const recipes = query.data?.pages.flatMap((p) => p.items) ?? [];
  const name = domain ?? '';

  return (
    <BrowseListScreen
      title={name}
      recipes={recipes}
      isLoading={query.isLoading}
      error={query.isError ? new Error('fetch failed') : null}
      onRetry={query.refetch}
      emptyMessage={`No recipes found for ${name}`}
      onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage(); }}
      isFetchingNextPage={query.isFetchingNextPage}
      headerComponent={<Stack.Screen options={{ title: name }} />}
    />
  );
}
