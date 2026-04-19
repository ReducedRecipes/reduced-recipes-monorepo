import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Dimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SQLite from 'expo-sqlite';
import { useSavedStore } from '@/stores/saved.store';
import { getAllSaved, type SavedRecipe } from '@/db/queries';
import { useSavedRecipes } from '@/hooks/useSavedRecipes';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { BookmarkIcon } from '@/components/icons';
import {
  CollectionSheet,
  type CollectionSheetRef,
} from '@/components/CollectionSheet';
import { fetchCollections, fetchCollectionBookmarks } from '@/lib/api';
import type { Collection, Bookmark } from '@rr/shared';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

const NUM_COLUMNS = 2;
const HORIZONTAL_PADDING = 16;
const GAP = 12;
const screenWidth = Dimensions.get('window').width;
const CARD_WIDTH = (screenWidth - HORIZONTAL_PADDING * 2 - GAP) / NUM_COLUMNS;

/** A virtual tab for the default local saved recipes */
const ALL_SAVED_TAB = { id: '__all__', name: 'Saved' } as const;

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

function bookmarkToSummary(b: Bookmark): RecipeSummary {
  return {
    id: b.recipe_id,
    title: '',
    domain: '',
    image_url: null,
    total_time: null,
    cook_time: null,
    yields: null,
    cuisine: null,
    category: null,
    tags: [],
  };
}

type TabItem = typeof ALL_SAVED_TAB | Collection;

export default function SavedScreen() {
  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  useEffect(() => {
    SQLite.openDatabaseAsync('recipes.db').then(setDb).catch(() => {});
  }, []);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const savedIds = useSavedStore((s) => s.ids);
  const { unsave } = useSavedRecipes({ db: db as any });

  // Collections state
  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeTab, setActiveTab] = useState<string>(ALL_SAVED_TAB.id);
  const [collectionBookmarks, setCollectionBookmarks] = useState<Bookmark[]>(
    [],
  );
  const [collectionLoading, setCollectionLoading] = useState(false);

  const sheetRef = useRef<CollectionSheetRef>(null);

  // Load local saved recipes
  const loadSaved = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      if (!db) { setLoading(false); return; }
      const saved = await getAllSaved(db);
      setRecipes(saved);
    } catch {
      setError('Could not load saved recipes.');
    } finally {
      setLoading(false);
    }
  }, [db]);

  // Load remote collections
  const loadCollections = useCallback(async () => {
    try {
      const res = await fetchCollections();
      setCollections(res.items);
    } catch {
      // silently fail — collections are supplementary
    }
  }, []);

  useEffect(() => {
    loadSaved();
    loadCollections();
  }, [loadSaved, loadCollections, savedIds]);

  // Load bookmarks when switching to a remote collection tab
  useEffect(() => {
    if (activeTab === ALL_SAVED_TAB.id) return;
    let cancelled = false;
    setCollectionLoading(true);
    fetchCollectionBookmarks(activeTab)
      .then((res) => {
        if (!cancelled) setCollectionBookmarks(res.items);
      })
      .catch(() => {
        if (!cancelled) setCollectionBookmarks([]);
      })
      .finally(() => {
        if (!cancelled) setCollectionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab]);

  const handleToggleBookmark = useCallback(
    (id: string) => {
      unsave(id);
    },
    [unsave],
  );

  const handleLongPress = useCallback(
    (recipeId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      sheetRef.current?.open(recipeId);
    },
    [],
  );

  const handleTabPress = useCallback((tabId: string) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);
  }, []);

  const handleCollectionCreated = useCallback((col: Collection) => {
    setCollections((prev) => [...prev, col]);
  }, []);

  const handleBookmarkMoved = useCallback(() => {
    // Reload current view
    if (activeTab === ALL_SAVED_TAB.id) {
      loadSaved();
    } else {
      // Re-fetch the collection bookmarks
      fetchCollectionBookmarks(activeTab)
        .then((res) => setCollectionBookmarks(res.items))
        .catch(() => {});
    }
  }, [activeTab, loadSaved]);

  const tabs: TabItem[] = [ALL_SAVED_TAB, ...collections];

  // Determine what data to show
  const isAllSaved = activeTab === ALL_SAVED_TAB.id;
  const isLoading = isAllSaved ? loading : collectionLoading;
  const displayData = isAllSaved ? recipes : collectionBookmarks;

  const renderItem = useCallback(
    ({ item, index }: { item: SavedRecipe | Bookmark; index: number }) => {
      const isSaved = 'title' in item && typeof item.title === 'string';
      const summary = isSaved
        ? toSummary(item as SavedRecipe)
        : bookmarkToSummary(item as Bookmark);
      const recipeId = isSaved
        ? (item as SavedRecipe).id
        : (item as Bookmark).recipe_id;

      return (
        <Pressable
          onLongPress={() => handleLongPress(recipeId)}
          delayLongPress={400}
          style={{
            width: CARD_WIDTH,
            marginLeft: index % NUM_COLUMNS === 0 ? 0 : GAP,
            marginBottom: GAP,
          }}
        >
          <RecipeCard
            recipe={summary}
            bookmarked
            onToggleBookmark={handleToggleBookmark}
          />
        </Pressable>
      );
    },
    [handleToggleBookmark, handleLongPress],
  );

  // Collection tabs bar
  const CollectionTabs = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      className="mb-2"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            onPress={() => handleTabPress(tab.id)}
            className={`rounded-full px-4 py-2 ${
              isActive ? 'bg-orange' : 'bg-bgMuted'
            }`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={tab.name}
          >
            <Text
              className={`text-sm ${isActive ? 'text-white' : 'text-ink'}`}
              style={{ fontFamily: fonts.bodyMed }}
            >
              {tab.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );

  if (error && isAllSaved) {
    return <ErrorState message={error} onRetry={loadSaved} />;
  }

  if (isLoading && displayData.length === 0) {
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
        {CollectionTabs}
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

  if (displayData.length === 0) {
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
        {CollectionTabs}
        <EmptyState
          icon={<BookmarkIcon color={colors.inkFaint} size={48} />}
          title={
            isAllSaved
              ? 'No saved recipes yet'
              : 'No recipes in this collection'
          }
          subtitle={
            isAllSaved
              ? 'Tap the bookmark icon on any recipe to save it for offline access.'
              : 'Move bookmarks here using long-press on any saved recipe.'
          }
        />
        <CollectionSheet
          ref={sheetRef}
          onMoved={handleBookmarkMoved}
          onCreated={handleCollectionCreated}
        />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-bg">
      <FlatList
        data={displayData}
        renderItem={renderItem}
        keyExtractor={(item) =>
          'saved_at' in item ? item.id : (item as Bookmark).id
        }
        numColumns={NUM_COLUMNS}
        contentContainerStyle={{
          paddingHorizontal: HORIZONTAL_PADDING,
          paddingBottom: 24,
        }}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        ListHeaderComponent={
          <View>
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
                {displayData.length}{' '}
                {displayData.length === 1 ? 'recipe' : 'recipes'} saved
              </Text>
            </View>
            {CollectionTabs}
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => {
              loadSaved();
              loadCollections();
            }}
          />
        }
      />
      <CollectionSheet
        ref={sheetRef}
        onMoved={handleBookmarkMoved}
        onCreated={handleCollectionCreated}
      />
    </View>
  );
}
