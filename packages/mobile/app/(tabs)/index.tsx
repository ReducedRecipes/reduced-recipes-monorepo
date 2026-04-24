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

function SectionLabel({ label }: { label: string }) {
  return (
    <View style={s.sectionLabelRow}>
      <Text style={s.sectionDiamond}>◆</Text>
      <Text style={s.sectionLabel}>{label}</Text>
      <View style={s.sectionRule} />
    </View>
  );
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
      <ActivityIndicator size="small" color={colors.accent} />
      <Text style={s.footerText}>Loading more recipes...</Text>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

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
      {/* Manifesto */}
      <View style={[s.manifestoWrap, { paddingTop: insets.top + 12 }]}>
        <Text style={s.manifestoLabel}>◆ FIG. 001 — MANIFESTO</Text>
        <Text style={s.manifestoHeading}>
          Recipes,{'\n'}
          <Text style={s.manifestoItalic}>reduced</Text> to what{'\n'}
          you actually need.
        </Text>
        <Text style={s.manifestoBody}>
          No backstory about a trip to Tuscany. No ads between steps. No scroll to the bottom to find the ingredients. Just the list, the method, and the number of minutes until dinner.
        </Text>
      </View>

      {/* CTA buttons */}
      <View style={s.ctaRow}>
        <Pressable
          onPress={() => router.push('/(tabs)/search')}
          style={s.ctaPrimary}
          accessibilityRole="button"
          accessibilityLabel="Search recipes"
        >
          <Text style={s.ctaPrimaryText}>→ SEE A RECIPE</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/(tabs)/search')}
          style={s.ctaSecondary}
          accessibilityRole="button"
          accessibilityLabel="Browse index"
        >
          <Text style={s.ctaSecondaryText}>BROWSE THE INDEX</Text>
        </Pressable>
      </View>

      {/* Featured */}
      {featuredRecipes.length > 0 && (
        <View style={s.section}>
          <SectionLabel label="FEATURE OF THE WEEK" />
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
          <SectionLabel label="QUICK & EASY" />
          <HorizontalRecipeList
            recipes={quickRecipes}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={handleToggleBookmark}
          />
        </View>
      )}

      {/* Cuisines */}
      <View style={s.section}>
        <SectionLabel label="BROWSE BY CUISINE" />
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
        <SectionLabel label="RECENTLY ADDED" />
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
        <RefreshControl refreshing={isLoading} onRefresh={handleRefresh} tintColor={colors.accent} />
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
  manifestoWrap: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  manifestoLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  manifestoHeading: {
    fontFamily: fonts.serif,
    fontSize: 34,
    color: colors.ink,
    lineHeight: 40,
  },
  manifestoItalic: {
    fontFamily: fonts.serifItalic,
    fontStyle: 'italic',
  },
  manifestoBody: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.ink2,
    lineHeight: 22,
    marginTop: 16,
  },
  ctaRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 32,
  },
  ctaPrimary: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ctaPrimaryText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ctaSecondary: {
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  ctaSecondaryText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  section: {
    marginTop: 32,
  },
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  sectionDiamond: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
  },
  sectionLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionRule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.rule,
  },
  cuisinePill: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cuisinePillText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.ink,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 10,
  },
  footerText: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.inkFaint,
  },
});
