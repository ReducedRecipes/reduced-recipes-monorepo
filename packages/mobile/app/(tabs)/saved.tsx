import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Dimensions,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import * as SQLite from 'expo-sqlite';
import { useRouter } from 'expo-router';
import { runMigrations } from '@/db/migrations';
import { useSavedStore } from '@/stores/saved.store';
import { getAllSaved, type SavedRecipe } from '@/db/queries';
import { useSavedRecipes } from '@/hooks/useSavedRecipes';
import { useAuthStore } from '@/stores/auth.store';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { BookmarkIcon } from '@/components/icons';
import {
  CollectionSheet,
  type CollectionSheetRef,
} from '@/components/CollectionSheet';
import { fetchCollections, fetchCollectionBookmarks, api } from '@/lib/api';
import type { Collection, Bookmark } from '@rr/shared';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary, RecipeDocument } from '@rr/shared';

const NUM_COLUMNS = 2;
const HORIZONTAL_PADDING = 16;
const GAP = 12;
const screenWidth = Dimensions.get('window').width;
const CARD_WIDTH = (screenWidth - HORIZONTAL_PADDING * 2 - GAP) / NUM_COLUMNS;

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
  // The API returns merged bookmark+recipe data with extra fields
  const data = b as Bookmark & Record<string, unknown>;
  return {
    id: b.recipe_id,
    title: (data.title as string) ?? '',
    domain: (data.domain as string) ?? '',
    image_url: (data.image_url as string | null) ?? null,
    total_time: (data.total_time as number | null) ?? null,
    cook_time: (data.cook_time as number | null) ?? null,
    yields: (data.yields as string | null) ?? null,
    cuisine: (data.cuisine as string | null) ?? null,
    category: (data.category as string | null) ?? null,
    tags: [],
  };
}

type TabItem = typeof ALL_SAVED_TAB | Collection;

export default function SavedScreen() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const [db, setDb] = useState<SQLite.SQLiteDatabase | null>(null);
  useEffect(() => {
    SQLite.openDatabaseAsync('recipes.db')
      .then(async (database) => {
        await runMigrations(database);
        setDb(database);
      })
      .catch(() => {});
  }, []);
  const [recipes, setRecipes] = useState<SavedRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const savedIds = useSavedStore((s) => s.ids);
  const { unsave } = useSavedRecipes({ db: db as any });

  const [collections, setCollections] = useState<Collection[]>([]);
  const [activeTab, setActiveTab] = useState<string>(ALL_SAVED_TAB.id);
  const [collectionBookmarks, setCollectionBookmarks] = useState<Bookmark[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [serverRecipes, setServerRecipes] = useState<RecipeSummary[]>([]);
  const [serverLoading, setServerLoading] = useState(false);

  const sheetRef = useRef<CollectionSheetRef>(null);

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

  const serverFetchedRef = useRef(false);

  const loadCollections = useCallback(async () => {
    if (serverFetchedRef.current) return;
    serverFetchedRef.current = true;
    setServerLoading(true);
    try {
      const res = await fetchCollections();
      setCollections(res.items);

      const defaultCol = res.items.find((c) => c.is_default === 1);
      if (defaultCol) {
        const bookmarks = await fetchCollectionBookmarks(defaultCol.id);
        const resolved = await Promise.all(
          bookmarks.items.map(async (b) => {
            try {
              const recipe = await api.recipes.get(b.recipe_id);
              return {
                id: recipe.id, title: recipe.title, domain: recipe.domain,
                image_url: recipe.image_url, total_time: recipe.total_time,
                cook_time: recipe.cook_time, yields: recipe.yields,
                cuisine: recipe.cuisine, category: recipe.category, tags: recipe.tags,
              } as RecipeSummary;
            } catch { return null; }
          }),
        );
        const filtered = resolved.filter((r): r is RecipeSummary => r !== null);
        console.log('[Saved] resolved recipes:', filtered.length);
        setServerRecipes(filtered);
      }
    } catch (e) {
      console.error('[Saved] loadCollections failed:', e);
    } finally {
      setServerLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  useEffect(() => {
    if (isAuthenticated) loadCollections();
  }, [isAuthenticated, loadCollections]);

  useEffect(() => {
    if (activeTab === ALL_SAVED_TAB.id) return;
    let cancelled = false;
    setCollectionLoading(true);
    (async () => {
      try {
        const bookmarks = await fetchCollectionBookmarks(activeTab);
        if (cancelled) return;
        const resolved = await Promise.all(
          bookmarks.items.map(async (b) => {
            try {
              const r = await api.recipes.get(b.recipe_id);
              return { id: r.id, title: r.title, domain: r.domain, image_url: r.image_url,
                total_time: r.total_time, cook_time: r.cook_time, yields: r.yields,
                cuisine: r.cuisine, category: r.category, tags: r.tags } as RecipeSummary;
            } catch { return null; }
          }),
        );
        if (!cancelled) setServerRecipes(resolved.filter((r): r is RecipeSummary => r !== null));
      } catch {}
      if (!cancelled) setCollectionLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeTab]);

  const handleToggleBookmark = useCallback((id: string) => { unsave(id); }, [unsave]);

  const handleLongPress = useCallback((recipeId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sheetRef.current?.open(recipeId);
  }, []);

  const handleTabPress = useCallback((tabId: string) => {
    Haptics.selectionAsync();
    setActiveTab(tabId);
  }, []);

  const handleCollectionCreated = useCallback((col: Collection) => {
    setCollections((prev) => [...prev, col]);
  }, []);

  const handleBookmarkMoved = useCallback(() => {
    if (activeTab === ALL_SAVED_TAB.id) {
      loadSaved();
    } else {
      fetchCollectionBookmarks(activeTab)
        .then((res) => setCollectionBookmarks(res.items))
        .catch(() => {});
    }
  }, [activeTab, loadSaved]);

  const nonDefaultCollections = collections.filter((c) => c.is_default !== 1);
  const tabs: TabItem[] = [ALL_SAVED_TAB, ...nonDefaultCollections];
  const isAllSaved = activeTab === ALL_SAVED_TAB.id;
  const isLoading = isAllSaved ? (loading || serverLoading) : collectionLoading;
  console.log(`[Saved] render: isAuth=${isAuthenticated} loading=${loading} serverLoading=${serverLoading} localRecipes=${recipes.length} serverRecipes=${serverRecipes.length} isLoading=${isLoading}`);
  // When on "Saved" tab, show local recipes + server recipes (deduplicated)
  const displayData: (SavedRecipe | RecipeSummary)[] = isAllSaved
    ? (() => {
        if (recipes.length > 0) return recipes;
        if (isAuthenticated && serverRecipes.length > 0) return serverRecipes;
        return [];
      })()
    : serverRecipes;

  const renderItem = useCallback(
    ({ item, index }: { item: SavedRecipe | RecipeSummary; index: number }) => {
      const isSavedItem = 'saved_at' in item;
      const summary: RecipeSummary = isSavedItem ? toSummary(item as SavedRecipe) : (item as RecipeSummary);
      const recipeId = summary.id;

      return (
        <Pressable
          onLongPress={() => handleLongPress(recipeId)}
          delayLongPress={400}
          style={{ width: CARD_WIDTH, marginLeft: index % NUM_COLUMNS === 0 ? 0 : GAP, marginBottom: GAP }}
        >
          <RecipeCard recipe={summary} />
        </Pressable>
      );
    },
    [handleToggleBookmark, handleLongPress],
  );

  const CollectionTabs = isAuthenticated && nonDefaultCollections.length > 0 ? (
    <View style={{ marginBottom: 8 }}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            onPress={() => handleTabPress(tab.id)}
            style={[st.tabChip, isActive && st.tabChipActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Text style={[st.tabChipText, isActive && st.tabChipTextActive]}>{tab.name}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
    </View>
  ) : null;

  console.log(`[Saved] displayData=${displayData.length} firstItem=${JSON.stringify(displayData[0]?.id)}`);

  // Not authenticated - show sign-in CTA
  if (!isAuthenticated && displayData.length === 0 && !loading) {
    return (
      <View style={st.container}>
        <View style={st.headerWrap}>
          <Text style={st.title}>Saved Recipes</Text>
        </View>
        <View style={st.ctaWrap}>
          <BookmarkIcon color={colors.rule} size={64} />
          <Text style={st.ctaTitle}>Save your favorites</Text>
          <Text style={st.ctaSubtitle}>
            Sign in to bookmark recipes, create collections, and sync across devices.
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/settings')} style={st.ctaButton}>
            <Text style={st.ctaButtonText}>SIGN IN →</Text>
          </Pressable>
          <Text style={st.ctaNote}>
            You can still browse and save recipes locally without signing in.
          </Text>
        </View>
      </View>
    );
  }

  if (error && isAllSaved) {
    return <ErrorState message={error} onRetry={loadSaved} />;
  }

  if (isLoading && displayData.length === 0) {
    console.log('[Saved] PATH: loading skeleton');
    return (
      <View style={st.container}>
        <View style={st.headerWrap}>
          <Text style={st.title}>Saved Recipes</Text>
        </View>
        {CollectionTabs}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: HORIZONTAL_PADDING }}>
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ width: CARD_WIDTH, marginLeft: i % NUM_COLUMNS === 0 ? 0 : GAP, marginBottom: GAP }}>
              <RecipeCardSkeleton />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (displayData.length === 0) {
    console.log('[Saved] PATH: empty state');
    return (
      <View style={st.container}>
        <View style={st.headerWrap}>
          <Text style={st.title}>Saved Recipes</Text>
        </View>
        {CollectionTabs}
        <EmptyState
          icon={<BookmarkIcon color={colors.inkFaint} size={48} />}
          title={isAllSaved ? 'No saved recipes yet' : 'No recipes in this collection'}
          subtitle={isAllSaved
            ? 'Tap the bookmark icon on any recipe to save it for offline access.'
            : 'Move bookmarks here using long-press on any saved recipe.'}
        />
        <CollectionSheet ref={sheetRef} onMoved={handleBookmarkMoved} onCreated={handleCollectionCreated} />
      </View>
    );
  }

  return (
    <View style={st.container}>
      <FlatList
        data={displayData}
        renderItem={renderItem}
        keyExtractor={(item) => ('saved_at' in item ? (item as SavedRecipe).id : (item as RecipeSummary).id)}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={{ paddingHorizontal: HORIZONTAL_PADDING, paddingBottom: 24 }}
        columnWrapperStyle={{ justifyContent: 'flex-start' }}
        ListHeaderComponent={
          <View>
            <View style={st.headerWrap}>
              <Text style={st.title}>Saved Recipes</Text>
              <Text style={st.countText}>
                {displayData.length} {displayData.length === 1 ? 'recipe' : 'recipes'} saved
              </Text>
            </View>
            {CollectionTabs}
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => { loadSaved(); if (isAuthenticated) loadCollections(); }}
          />
        }
      />
      <CollectionSheet ref={sheetRef} onMoved={handleBookmarkMoved} onCreated={handleCollectionCreated} />
    </View>
  );
}

const st = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerWrap: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: 28,
    color: colors.ink,
  },
  countText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    letterSpacing: 0.5,
    marginTop: 4,
    textTransform: 'uppercase',
  },
  tabChip: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tabChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  tabChipText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.ink,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tabChipTextActive: {
    color: '#FFFFFF',
  },
  // Sign-in CTA
  ctaWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  ctaTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    textAlign: 'center',
    marginTop: 20,
  },
  ctaSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 15,
    color: colors.inkFaint,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 8,
  },
  ctaButton: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 24,
  },
  ctaButtonText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  ctaNote: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.inkFaint,
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 18,
  },
});
