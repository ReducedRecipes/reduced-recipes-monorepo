import React from "react";
import { View, ActivityIndicator } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { RecipeCard } from "./RecipeCard";
import { RecipeCardSkeleton } from "./RecipeCardSkeleton";
import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { SearchIcon } from "./icons";
import { colors } from "../constants/theme";
import type { RecipeSummary } from "@rr/shared";

export interface BrowseListScreenProps {
  title: string;
  recipes: RecipeSummary[];
  isLoading: boolean;
  error: Error | null;
  onRetry?: () => void;
  onToggleBookmark: (id: string) => void;
  isSaved: (id: string) => boolean;
  emptyMessage: string;
  onEndReached?: () => void;
  isFetchingNextPage?: boolean;
  headerComponent?: React.ReactElement;
}

export function BrowseListScreen({
  title,
  recipes,
  isLoading,
  error,
  onRetry,
  onToggleBookmark,
  isSaved,
  emptyMessage,
  onEndReached,
  isFetchingNextPage,
  headerComponent,
}: BrowseListScreenProps) {
  if (isLoading) {
    return (
      <View className="flex-1 bg-cream px-4 pt-4">
        {headerComponent}
        {Array.from({ length: 4 }).map((_, i) => (
          <RecipeCardSkeleton key={i} />
        ))}
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 bg-cream">
        {headerComponent}
        <ErrorState
          message={`Failed to load recipes for "${title}"`}
          onRetry={onRetry}
        />
      </View>
    );
  }

  if (recipes.length === 0) {
    return (
      <View className="flex-1 bg-cream">
        {headerComponent}
        <EmptyState
          icon={<SearchIcon size={48} color={colors.inkMuted} />}
          title={emptyMessage}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-cream">
      {headerComponent}
      <FlashList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View className="px-4 mb-4">
            <RecipeCard
              recipe={item}
              bookmarked={isSaved(item.id)}
              onToggleBookmark={onToggleBookmark}
            />
          </View>
        )}
        estimatedItemSize={220}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator
              size="small"
              color={colors.orange}
              className="py-4"
            />
          ) : null
        }
        contentContainerStyle={{ paddingTop: 16 }}
      />
    </View>
  );
}
