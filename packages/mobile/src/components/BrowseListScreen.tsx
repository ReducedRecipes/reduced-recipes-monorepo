import React from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
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
  emptyMessage,
  onEndReached,
  isFetchingNextPage,
  headerComponent,
}: BrowseListScreenProps) {
  if (isLoading) {
    return (
      <View style={s.container}>
        {headerComponent}
        <View style={s.skeletonList}>
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={s.cardWrap}>
              <RecipeCardSkeleton />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={s.container}>
        {headerComponent}
        <ErrorState
          message={`Failed to load recipes for "${title}"`}
          onRetry={onRetry!}
        />
      </View>
    );
  }

  if (recipes.length === 0) {
    return (
      <View style={s.container}>
        {headerComponent}
        <EmptyState
          icon={<SearchIcon size={48} color={colors.inkFaint} />}
          title={emptyMessage}
        />
      </View>
    );
  }

  return (
    <View style={s.container}>
      {headerComponent}
      <FlashList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={s.cardWrap}>
            <RecipeCard recipe={item} />
          </View>
        )}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator size="small" color={colors.accent} style={s.spinner} />
          ) : null
        }
        contentContainerStyle={{ paddingTop: 16 }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  skeletonList: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  cardWrap: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  spinner: {
    paddingVertical: 16,
  },
});
