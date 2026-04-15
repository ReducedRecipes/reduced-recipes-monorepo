import React, { useMemo } from "react";
import { View, Text, ActivityIndicator, Pressable } from "react-native";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { FlashList } from "@shopify/flash-list";

import { useRecipes } from "@/hooks/useRecipes";
import { RecipeCard } from "@/components/RecipeCard";
import { EmptyState } from "@/components/EmptyState";
import { ErrorState } from "@/components/ErrorState";
import { colors, fonts } from "@/constants/theme";

export default function CuisineScreen() {
  const { cuisine } = useLocalSearchParams<{ cuisine: string }>();
  const router = useRouter();
  const {
    data,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useRecipes({ cuisine });

  const recipes = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  const displayName = cuisine
    ? cuisine.charAt(0).toUpperCase() + cuisine.slice(1)
    : "";

  return (
    <>
      <Stack.Screen
        options={{
          title: displayName,
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}
              accessibilityLabel="Go back"
            >
              <Text style={{ fontSize: 18, color: colors.ink }}>←</Text>
            </Pressable>
          ),
        }}
      />

      <View className="flex-1 bg-[#FAFAF8]">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.orange} />
            <Text
              className="mt-3"
              style={{ fontFamily: fonts.body, color: colors.inkMuted }}
            >
              Loading recipes...
            </Text>
          </View>
        ) : error ? (
          <ErrorState
            message={error.message ?? "Failed to load recipes"}
            onRetry={() => refetch()}
          />
        ) : recipes.length === 0 ? (
          <EmptyState
            icon={<Text style={{ fontSize: 48 }}>🌍</Text>}
            title={`No recipes found for ${displayName}`}
          />
        ) : (
          <FlashList
            data={recipes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View className="px-4 mb-4">
                <RecipeCard recipe={item} />
              </View>
            )}
            estimatedItemSize={220}
            onEndReached={() => {
              if (hasNextPage) fetchNextPage();
            }}
            onEndReachedThreshold={0.3}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View className="py-4 items-center">
                  <ActivityIndicator size="small" color={colors.orange} />
                </View>
              ) : null
            }
          />
        )}
      </View>
    </>
  );
}
