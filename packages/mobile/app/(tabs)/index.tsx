import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFunding } from '@/hooks/useFunding';
import { useHealth } from '@/hooks/useHealth';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRecipes } from '@/hooks/useRecipes';
import { RecipeCard } from '@/components/RecipeCard';
import { ErrorState } from '@/components/ErrorState';
import { SearchIcon } from '@/components/icons';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

function pickFeatured(items: RecipeSummary[]): RecipeSummary | null {
  return (
    items.find((r) => r.image_url && r.total_time && r.total_time > 0) ??
    items.find((r) => r.image_url) ??
    items[0] ??
    null
  );
}

function formatTime(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

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

function FeatureHero({ recipe }: { recipe: RecipeSummary }) {
  const router = useRouter();
  const time = formatTime(recipe.total_time ?? recipe.cook_time);

  return (
    <Pressable
      onPress={() => router.push(`/recipe/${recipe.id}`)}
      style={s.heroCard}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Open recipe: ${recipe.title}`}
    >
      {recipe.image_url && (
        <Image
          source={{ uri: recipe.image_url }}
          style={s.heroImage}
          contentFit="cover"
          transition={200}
          recyclingKey={recipe.id}
        />
      )}
      <View style={s.heroBody}>
        <Text style={s.heroEyebrow}>◆ THIS WEEK</Text>
        <Text style={s.heroTitle} numberOfLines={3}>{recipe.title}</Text>
        <View style={s.heroMeta}>
          {recipe.domain ? <Text style={s.heroDomain}>{recipe.domain}</Text> : null}
          {recipe.domain && time ? <Text style={s.heroDot}> · </Text> : null}
          {time ? <Text style={s.heroTime}>{time}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

function HorizontalRecipeList({
  recipes,
}: {
  recipes: RecipeSummary[];
}) {
  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <View style={{ width: 260, marginRight: 12 }}>
        <RecipeCard recipe={item} />
      </View>
    ),
    [],
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

function FundingCard() {
  const { data } = useFunding();
  if (!data) return null;

  const fundedWidth = Math.min(data.funded_pct, 100);

  return (
    <View style={s.fundingCard}>
      <Text style={s.fundingHeader}>◆ FUNDING</Text>
      <Text style={s.fundingCost}>
        ${data.monthly_cost.toFixed(2)}<Text style={s.fundingCostLabel}> / month</Text>
      </Text>
      <Text style={s.fundingPct}>{data.funded_pct}% funded</Text>
      <View style={s.fundingTrack}>
        <View style={[s.fundingFill, { width: `${fundedWidth}%` as unknown as number }]} />
      </View>
      <Pressable
        onPress={() => Linking.openURL('https://ko-fi.com/reducedrecipes')}
        style={s.fundingSupportButton}
        accessibilityRole="link"
        accessibilityLabel="Support us on Ko-fi"
      >
        <Text style={s.fundingSupportText}>SUPPORT US →</Text>
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const trending = useRecipes({ sort: 'hot', limit: 12 });
  const quickEasy = useRecipes({ max_time: 20, limit: 10 });
  const recent = useRecipes({ sort: 'newest' });
  const { data: health } = useHealth();

  const isLoading = trending.isLoading || quickEasy.isLoading || recent.isLoading;
  const isError = trending.isError && quickEasy.isError && recent.isError;

  const handleRefresh = useCallback(() => {
    trending.refetch();
    quickEasy.refetch();
    recent.refetch();
  }, [trending, quickEasy, recent]);

  const trendingItems = trending.data?.pages.flatMap((p) => p.items) ?? [];

  const featuredRecipe = useMemo(() => {
    if (health?.featured_recipe_id) {
      const fromTrending = trendingItems.find((r) => r.id === health.featured_recipe_id);
      if (fromTrending) return fromTrending;
    }
    return pickFeatured(trendingItems);
  }, [health?.featured_recipe_id, trendingItems]);

  const trendingShelf = useMemo(
    () =>
      trendingItems
        .filter((r) => r.id !== featuredRecipe?.id)
        .slice(0, 8),
    [trendingItems, featuredRecipe?.id],
  );

  const excludedIds = useMemo(() => {
    const set = new Set<string>();
    if (featuredRecipe) set.add(featuredRecipe.id);
    for (const r of trendingShelf) set.add(r.id);
    return set;
  }, [featuredRecipe, trendingShelf]);

  const quickRecipes = (quickEasy.data?.pages.flatMap((p) => p.items) ?? [])
    .filter((r) => !excludedIds.has(r.id));
  const recentRecipes = (recent.data?.pages.flatMap((p) => p.items) ?? [])
    .filter((r) => !excludedIds.has(r.id));

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

      {/* Ingredient Board CTA */}
      <Pressable
        onPress={() => router.push('/ingredients')}
        style={s.fridgeCta}
        accessibilityRole="button"
        accessibilityLabel="Search recipes by ingredients"
      >
        <Text style={s.fridgeCtaLabel}>◆ INGREDIENT BOARD</Text>
        <Text style={s.fridgeCtaHeading}>What's in your fridge?</Text>
        <Text style={s.fridgeCtaBody}>
          Add what you have on hand and we'll find recipes you can make right now.
        </Text>
        <Text style={s.fridgeCtaAction}>→ GET STARTED</Text>
      </Pressable>

      {/* Feature of the Week: singular curated hero */}
      {featuredRecipe && (
        <View style={s.section}>
          <SectionLabel label="FEATURE OF THE WEEK" />
          <View style={{ paddingHorizontal: 16 }}>
            <FeatureHero recipe={featuredRecipe} />
          </View>
        </View>
      )}

      {/* Trending: hot_score shelf */}
      {trendingShelf.length > 0 && (
        <View style={s.section}>
          <SectionLabel label="TRENDING" />
          <HorizontalRecipeList recipes={trendingShelf} />
        </View>
      )}

      {/* Quick & Easy: under 20 min */}
      {quickRecipes.length > 0 && (
        <View style={s.section}>
          <SectionLabel label="QUICK & EASY" />
          <HorizontalRecipeList recipes={quickRecipes} />
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

      {/* Funding */}
      <View style={{ paddingHorizontal: 16 }}>
        <FundingCard />
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
        <RecipeCard recipe={item} />
      </View>
    ),
    [],
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
  fridgeCta: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
    padding: 16,
  },
  fridgeCtaLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fridgeCtaHeading: {
    fontFamily: fonts.serif,
    fontSize: 22,
    color: colors.ink,
    lineHeight: 28,
  },
  fridgeCtaBody: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.ink2,
    lineHeight: 20,
    marginTop: 6,
  },
  fridgeCtaAction: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 12,
  },
  section: {
    marginTop: 32,
  },
  heroCard: {
    borderWidth: 1,
    borderColor: colors.rule,
    backgroundColor: colors.bgCard,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    aspectRatio: 4 / 3,
  },
  heroBody: {
    padding: 16,
  },
  heroEyebrow: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.accent,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  heroTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    lineHeight: 30,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  heroDomain: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  heroDot: {
    color: colors.inkFaint,
    fontSize: 12,
  },
  heroTime: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: colors.inkFaint,
    letterSpacing: 0.5,
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
  fundingCard: {
    borderWidth: 1,
    borderColor: colors.rule,
    padding: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  fundingHeader: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  fundingCost: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
  },
  fundingCostLabel: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkFaint,
  },
  fundingPct: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 0.5,
    marginTop: 4,
    marginBottom: 8,
  },
  fundingTrack: {
    height: 4,
    backgroundColor: colors.rule,
    marginBottom: 12,
  },
  fundingFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  fundingSupportButton: {
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: 'center',
  },
  fundingSupportText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
});
