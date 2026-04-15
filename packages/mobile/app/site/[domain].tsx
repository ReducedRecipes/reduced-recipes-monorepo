import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { FlashList } from '@shopify/flash-list';
import { useRecipes } from '@/hooks/useRecipes';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { useSavedRecipes } from '@/hooks/useSavedRecipes';
import { api } from '@/lib/api';
import { colors } from '@/constants/theme';
import { SearchIcon } from '@/components/icons';

export default function DomainScreen() {
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useRecipes({ domain });
  const db = useSQLiteContext();
  const { isSaved, save, unsave } = useSavedRecipes({ db });

  const recipes = data?.pages.flatMap((page) => page.items) ?? [];
  const domainName = domain ?? '';

  const handleToggleBookmark = async (id: string) => {
    if (isSaved(id)) {
      await unsave(id);
    } else {
      const recipe = await api.recipes.get(id);
      await save(recipe);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 bg-cream px-4 pt-4">
        <Stack.Screen options={{ title: domainName }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 bg-cream">
        <Stack.Screen options={{ title: domainName }} />
        <ErrorState message={`Failed to load recipes from ${domainName}`} onRetry={refetch} />
      </View>
    );
  }

  if (recipes.length === 0) {
    return (
      <View className="flex-1 bg-cream">
        <Stack.Screen options={{ title: domainName }} />
        <EmptyState
          icon={<SearchIcon size={48} color={colors.inkMuted} />}
          title={`No recipes found for ${domainName}`}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      <Stack.Screen options={{ title: domainName }} />
      <FlashList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="px-4 mb-4">
            <RecipeCard
              recipe={item}
              bookmarked={isSaved(item.id)}
              onToggleBookmark={handleToggleBookmark}
            />
          </View>
        )}
        estimatedItemSize={220}
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) fetchNextPage();
        }}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator size="small" color={colors.orange} className="py-4" />
          ) : null
        }
        contentContainerStyle={{ paddingTop: 16 }}
      />
    </View>
  );
}
