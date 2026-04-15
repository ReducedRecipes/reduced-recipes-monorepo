import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipes } from '@/hooks/useRecipes';
import { RecipeCard } from '@/components/RecipeCard';
import { TagPill } from '@/components/TagPill';
import { ErrorState } from '@/components/ErrorState';
import { SearchIcon } from '@/components/icons';
import { useSavedRecipes } from '@/hooks/useSavedRecipes';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

const CUISINES = [
  'Italian',
  'Mexican',
  'Chinese',
  'Japanese',
  'Indian',
  'Thai',
  'French',
  'Mediterranean',
  'Korean',
  'American',
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function HorizontalRecipeList({
  recipes,
  bookmarkedIds,
  onToggleBookmark,
}: {
  recipes: RecipeSummary[];
  bookmarkedIds: Set<string>;
  onToggleBookmark: (id: string) => void;
}) {
  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <View style={{ width: 260, marginRight: 12 }}>
        <RecipeCard
          recipe={item}
          bookmarked={bookmarkedIds.has(item.id)}
          onToggleBookmark={onToggleBookmark}
        />
      </View>
    ),
    [bookmarkedIds, onToggleBookmark],
  );

  return (
    <FlatList
      data={recipes}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16 }}
    />
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const greeting = useMemo(getGreeting, []);

  // Featured recipes (first 5)
  const featured = useRecipes({ limit: 5 });
  // Quick & Easy (under 30 min)
  const quickEasy = useRecipes({ max_time: 30, limit: 10 });
  // Recently Added (vertical infinite scroll)
  const recent = useRecipes({});

  const { isSaved, save, unsave } = useSavedRecipes();

  const bookmarkedIds = useMemo(() => {
    const ids = new Set<string>();
    const allRecipes = [
      ...(featured.data?.pages.flatMap((p) => p.items) ?? []),
      ...(quickEasy.data?.pages.flatMap((p) => p.items) ?? []),
      ...(recent.data?.pages.flatMap((p) => p.items) ?? []),
    ];
    for (const r of allRecipes) {
      if (isSaved(r.id)) ids.add(r.id);
    }
    return ids;
  }, [featured.data, quickEasy.data, recent.data, isSaved]);

  const allRecipesList = useMemo(() => [
    ...(featured.data?.pages.flatMap((p) => p.items) ?? []),
    ...(quickEasy.data?.pages.flatMap((p) => p.items) ?? []),
    ...(recent.data?.pages.flatMap((p) => p.items) ?? []),
  ], [featured.data, quickEasy.data, recent.data]);

  const handleToggleBookmark = useCallback(
    (id: string) => {
      if (isSaved(id)) {
        unsave(id);
      } else {
        const recipe = allRecipesList.find((r) => r.id === id);
        if (recipe) save(recipe);
      }
    },
    [isSaved, save, unsave, allRecipesList],
  );

  const isLoading = featured.isLoading || quickEasy.isLoading || recent.isLoading;
  const isError = featured.isError && quickEasy.isError && recent.isError;

  const handleRefresh = useCallback(() => {
    featured.refetch();
    quickEasy.refetch();
    recent.refetch();
  }, [featured, quickEasy, recent]);

  const featuredRecipes = featured.data?.pages.flatMap((p) => p.items).slice(0, 5) ?? [];
  const quickRecipes = quickEasy.data?.pages.flatMap((p) => p.items) ?? [];
  const recentRecipes = recent.data?.pages.flatMap((p) => p.items) ?? [];

  if (isError) {
    return (
      <ErrorState
        message="Could not load recipes. Please try again."
        onRetry={handleRefresh}
      />
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-bg"
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} />
      }
    >
      {/* Greeting */}
      <View className="px-4 pt-6 pb-2">
        <Text
          className="text-2xl text-ink"
          style={{ fontFamily: fonts.display }}
        >
          {greeting}
        </Text>
      </View>

      {/* Search Bar (navigates to /search) */}
      <Pressable
        onPress={() => router.push('/(tabs)/search')}
        className="mx-4 my-3 flex-row items-center rounded-xl bg-bg-muted px-4 py-3"
        accessibilityRole="button"
        accessibilityLabel="Search recipes"
        style={{ minHeight: 44 }}
      >
        <SearchIcon color={colors.inkMuted} size={20} />
        <Text
          className="ml-3 text-base"
          style={{ fontFamily: fonts.body, color: colors.inkFaint }}
        >
          Search recipes...
        </Text>
      </Pressable>

      {/* Featured Section */}
      {featuredRecipes.length > 0 && (
        <View className="mt-4">
          <Text
            className="px-4 mb-3 text-lg text-ink"
            style={{ fontFamily: fonts.display }}
          >
            Featured
          </Text>
          <HorizontalRecipeList
            recipes={featuredRecipes}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
          />
        </View>
      )}

      {/* Quick & Easy Section */}
      {quickRecipes.length > 0 && (
        <View className="mt-6">
          <Text
            className="px-4 mb-3 text-lg text-ink"
            style={{ fontFamily: fonts.display }}
          >
            Quick &amp; Easy
          </Text>
          <HorizontalRecipeList
            recipes={quickRecipes}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
          />
        </View>
      )}

      {/* Cuisine Pills */}
      <View className="mt-6">
        <Text
          className="px-4 mb-3 text-lg text-ink"
          style={{ fontFamily: fonts.display }}
        >
          Cuisines
        </Text>
        <FlatList
          data={CUISINES}
          renderItem={({ item }) => (
            <View className="mr-2">
              <TagPill tag={item} />
            </View>
          )}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        />
      </View>

      {/* Recently Added (vertical list) */}
      <View className="mt-6 px-4 pb-8">
        <Text
          className="mb-3 text-lg text-ink"
          style={{ fontFamily: fonts.display }}
        >
          Recently Added
        </Text>
        {recentRecipes.map((recipe) => (
          <View key={recipe.id} className="mb-3">
            <RecipeCard
              recipe={recipe}
              bookmarked={bookmarkedIds.has(recipe.id)}
              onToggleBookmark={handleToggleBookmark}
            />
          </View>
        ))}
        {recent.hasNextPage && (
          <Pressable
            onPress={() => recent.fetchNextPage()}
            className="items-center py-4"
            accessibilityRole="button"
            accessibilityLabel="Load more recipes"
          >
            <Text
              className="text-base"
              style={{ fontFamily: fonts.bodyMed, color: colors.orange }}
            >
              Load more
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}
