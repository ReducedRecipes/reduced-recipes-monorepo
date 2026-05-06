import React from 'react';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useRecipes } from '@/hooks/useRecipes';
import { BrowseListScreen } from '@/components/BrowseListScreen';

export default function CuisineScreen() {
  const { cuisine } = useLocalSearchParams<{ cuisine: string }>();
  const query = useRecipes({ cuisine });
  const recipes = query.data?.pages.flatMap((p) => p.items) ?? [];
  const name = cuisine ? cuisine.charAt(0).toUpperCase() + cuisine.slice(1) : '';

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
      headerComponent={
        <Stack.Screen
          options={{ headerShown: true, title: name, headerBackTitle: 'Back' }}
        />
      }
    />
  );
}
