import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRecipes } from '@/hooks/useRecipes';
import { BrowseListScreen } from '@/components/BrowseListScreen';

export default function TagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const query = useRecipes({ tag });
  const recipes = query.data?.pages.flatMap((p) => p.items) ?? [];
  const tagName = tag ? tag.charAt(0).toUpperCase() + tag.slice(1) : '';

  return (
    <BrowseListScreen
      title={tagName}
      recipes={recipes}
      isLoading={query.isLoading}
      error={query.isError ? new Error('fetch failed') : null}
      onRetry={query.refetch}
      emptyMessage={`No recipes found for ${tagName}`}
      onEndReached={() => { if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage(); }}
      isFetchingNextPage={query.isFetchingNextPage}
      headerComponent={<Stack.Screen options={{ title: tagName }} />}
    />
  );
}
