import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useRecipes } from '@/hooks/useRecipes';
import { RecipeCard } from '@/components/RecipeCard';
import { ErrorState } from '@/components/ErrorState';
import { SearchIcon } from '@/components/icons';
import { useSavedRecipes } from '@/hooks/useSavedRecipes';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

const CUISINES = [
  'Italian', 'Mexican', 'Chinese', 'Japanese', 'Indian',
  'Thai', 'French', 'Mediterranean', 'Korean', 'American',
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

function CuisinePill({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={s.cuisinePill}>
      <Text style={s.cuisinePillText}>{name}</Text>
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const greeting = useMemo(getGreeting, []);

  const featured = useRecipes({ limit: 5 });
  const quickEasy = useRecipes({ max_time: 30, limit: 10 });
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

  const handleToggleBookmark = useCallback(
    (id: string) => {
      if (isSaved(id)) {
        unsave(id);
      } else {
        save(id);
      }
    },
    [isSaved, save, unsave],
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
      style={s.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.orange} />
      }
    >
      {/* Greeting */}
      <View style={s.greetingWrap}>
        <Text style={s.greeting}>{greeting}</Text>
      </View>

      {/* Search Bar */}
      <Pressable
        onPress={() => router.push('/(tabs)/search')}
        style={s.searchBar}
        accessibilityRole="button"
        accessibilityLabel="Search recipes"
      >
        <SearchIcon color={colors.inkMuted} size={20} />
        <Text style={s.searchPlaceholder}>Search recipes...</Text>
      </Pressable>

      {/* Featured */}
      {featuredRecipes.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Featured</Text>
          <HorizontalRecipeList
            recipes={featuredRecipes}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
          />
        </View>
      )}

      {/* Quick & Easy */}
      {quickRecipes.length > 0 && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>Quick & Easy</Text>
          <HorizontalRecipeList
            recipes={quickRecipes}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
          />
        </View>
      )}

      {/* Cuisines */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>Cuisines</Text>
        <FlatList
          data={CUISINES}
          renderItem={({ item }) => (
            <CuisinePill
              name={item}
              onPress={() => router.push(`/cuisine/${item.toLowerCase()}`)}
            />
          )}
          keyExtractor={(item) => item}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
        />
      </View>

      {/* Recently Added */}
      <View style={[s.section, { paddingHorizontal: 16, paddingBottom: 32 }]}>
        <Text style={[s.sectionTitle, { paddingHorizontal: 0 }]}>Recently Added</Text>
        {recentRecipes.map((recipe) => (
          <View key={recipe.id} style={{ marginBottom: 12 }}>
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
            style={s.loadMore}
            accessibilityRole="button"
            accessibilityLabel="Load more recipes"
          >
            <Text style={s.loadMoreText}>Load more</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  greetingWrap: {
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 4,
  },
  greeting: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
  },
  searchBar: {
    marginHorizontal: 16,
    marginVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgMuted,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  searchPlaceholder: {
    marginLeft: 12,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.inkFaint,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontFamily: fonts.display,
    fontSize: 18,
    color: colors.ink,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  cuisinePill: {
    backgroundColor: colors.orangeLight,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 99,
  },
  cuisinePillText: {
    fontFamily: fonts.bodyMed,
    fontSize: 13,
    color: colors.orange,
  },
  loadMore: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  loadMoreText: {
    fontFamily: fonts.bodyMed,
    fontSize: 15,
    color: colors.orange,
  },
});
