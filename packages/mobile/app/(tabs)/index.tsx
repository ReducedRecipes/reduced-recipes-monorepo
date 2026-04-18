import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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

function LoadingFooter() {
  return (
    <View style={s.footer}>
      <ActivityIndicator size="small" color={colors.orange} />
      <Text style={s.footerText}>Loading more recipes...</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        save(id as any);
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

  const handleEndReached = useCallback(() => {
    if (recent.hasNextPage && !recent.isFetchingNextPage) {
      recent.fetchNextPage();
    }
  }, [recent]);

  if (isError) {
    return (
      <ErrorState
        message="Could not load recipes. Please try again."
        onRetry={handleRefresh}
      />
    );
  }

  const header = (
    <>
      {/* Greeting */}
      <View style={[s.greetingWrap, { paddingTop: 12 }]}>
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

      {/* Recently Added header */}
      <View style={[s.section, { paddingHorizontal: 16 }]}>
        <Text style={[s.sectionTitle, { paddingHorizontal: 0 }]}>Recently Added</Text>
      </View>
    </>
  );

  const renderRecipe = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <View style={{ marginBottom: 12, marginHorizontal: 16 }}>
        <RecipeCard
          recipe={item}
          bookmarked={bookmarkedIds.has(item.id)}
          onToggleBookmark={handleToggleBookmark}
        />
      </View>
    ),
    [bookmarkedIds, handleToggleBookmark],
  );

  return (
    <FlatList
      data={recentRecipes}
      renderItem={renderRecipe}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={header}
      ListFooterComponent={recent.isFetchingNextPage ? LoadingFooter : null}
      onEndReached={handleEndReached}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.orange} />
      }
      contentContainerStyle={{ paddingBottom: 32 }}
      contentInsetAdjustmentBehavior="automatic"
      style={s.container}
    />
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  greetingWrap: {
    paddingHorizontal: 16,
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  footerText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
  },
});
