import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useSavedStore } from '@/stores/saved.store';
import { getAllSaved, type SavedRecipe } from '@/db/queries';
import { useSavedRecipes } from '@/hooks/useSavedRecipes';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { BookmarkIcon } from '@/components/icons';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

const NUM_COLUMNS = 2;
const HORIZONTAL_PADDING = 16;
const GAP = 12;
const screenWidth = Dimensions.get('window').width;
const CARD_WIDTH = (screenWidth - HORIZONTAL_PADDING * 2 - GAP) / NUM_COLUMNS;

function toSummary(saved: SavedRecipe): RecipeSummary {
  return {
    id: saved.id,
    title: saved.title,
    domain: saved.domain,
    image_url: saved.image_url,
    total_time: saved.total_time,
    cook_time: saved.cook_time,
    yields: saved.yields,
    cuisine: saved.cuisine,
    category: saved.category,
    tags: saved.tags,
  };
}

export default function SavedScreen() {
  const db = useSQLiteContext();
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const savedIds = useSavedStore((s) => s.ids);
  const { unsave } = useSavedRecipes({ db });

  const loadSaved = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      const saved = await getAllSaved(db);
      setRecipes(saved);
    } catch {
      setError('Could not load saved recipes.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved, savedIds]);

  const handleToggleBookmark = useCallback(
    (id: string) => {
      unsave(id);
    },
    [unsave],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: SavedRecipe; index: number }) => (
      <View
        style={{
          width: CARD_WIDTH,
          marginLeft: index % NUM_COLUMNS === 0 ? 0 : GAP,
          marginBottom: GAP,
        }}
      >
        <RecipeCard
          recipe={toSummary(item)}
          bookmarked
          onToggleBookmark={handleToggleBookmark}
        />
      </View>
    ),
    [handleToggleBookmark],
  );

  if (error) {
    return <ErrorState message={error} onRetry={loadSaved} />;
  }

  if (loading && recipes.length === 0) {
    return (
      <View className="flex-1 bg-bg">
        <View className="px-4 pt-6 pb-4">
          <Text
            className="text-2xl text-ink"
            style={{ fontFamily: fonts.display }}
          >
            Saved Recipes
          </Text>
        </View>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            paddingHorizontal: HORIZONTAL_PADDING,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={{
                width: CARD_WIDTH,
                marginLeft: i % NUM_COLUMNS === 0 ? 0 : GAP,
                marginBottom: GAP,
              }}
            >
              <RecipeCardSkeleton />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (recipes.length === 0) {
    return (
      <View className="flex-1 bg-bg">
        <View className="px-4 pt-6 pb-4">
          <Text
            className="text-2xl text-ink"
            style={{ fontFamily: fonts.display }}
          >
            Saved Recipes
          </Text>
        </View>
        <EmptyState
          icon={<BookmarkIcon color={colors.inkFaint} size={48} />}
          title="No saved recipes yet"
          subtitle="Tap the bookmark icon on any recipe to save it for offline access."
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={recipes}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 24,
        }}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        ListHeaderComponent={
          <View className="pt-6 pb-4">
            <Text
              className="text-2xl text-ink"
              style={{ fontFamily: fonts.display }}
            >
              Saved Recipes
            </Text>
            <Text
              className="mt-1 text-sm"
              style={{ fontFamily: fonts.body, color: colors.inkMuted }}
            >
              {recipes.length} {recipes.length === 1 ? 'recipe' : 'recipes'} saved
            </Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadSaved} />
        }
      />
    </View>
  );
}
