import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import GorhomBottomSheet from '@gorhom/bottom-sheet';
import { SearchBar } from '@/components/SearchBar';
import { FilterSheet, type SearchFilters } from '@/components/FilterSheet';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SearchIcon } from '@/components/icons';
import { useSearch } from '@/hooks/useSearch';
import { mmkv } from '@/lib/mmkv';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT = 10;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(mmkv.getString(RECENT_SEARCHES_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

function saveRecentSearch(query: string) {
  const existing = getRecentSearches();
  const updated = [query, ...existing.filter((q) => q !== query)].slice(0, MAX_RECENT);
  mmkv.set(RECENT_SEARCHES_KEY, JSON.stringify(updated));
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<SearchFilters>({
    cuisines: [],
    dietary: [],
  });
  const [filterVisible, setFilterVisible] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(getRecentSearches);
  const sheetRef = useRef<GorhomBottomSheet>(null);

  const { data, isLoading, isError, refetch } = useSearch(query, {
    cuisine: filters.cuisines[0],
    max_time: filters.maxTime,
  });

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const handleSelectRecent = useCallback(
    (term: string) => {
      setQuery(term);
      handleSearch(term);
    },
    [handleSearch],
  );

  const handleApplyFilters = useCallback((newFilters: SearchFilters) => {
    setFilters(newFilters);
    setFilterVisible(false);
  }, []);

  const handleRemoveFilter = useCallback(
    (type: 'time' | 'cuisine' | 'dietary', value?: string) => {
      setFilters((prev) => {
        if (type === 'time') return { ...prev, maxTime: undefined };
        if (type === 'cuisine' && value)
          return { ...prev, cuisines: prev.cuisines.filter((c) => c !== value) };
        if (type === 'dietary' && value)
          return { ...prev, dietary: prev.dietary.filter((d) => d !== value) };
        return prev;
      });
    },
    [],
  );

  const hasActiveFilters =
    filters.maxTime !== undefined ||
    filters.cuisines.length > 0 ||
    filters.dietary.length > 0;

  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length >= 2;
  const recipes: RecipeSummary[] = data ?? [];

  // Save successful searches
  React.useEffect(() => {
    if (showResults && recipes.length > 0 && trimmedQuery.length >= 2) {
      saveRecentSearch(trimmedQuery);
      setRecentSearches(getRecentSearches());
    }
  }, [showResults, recipes.length, trimmedQuery]);

  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <View className="px-4 mb-3">
        <RecipeCard recipe={item} />
      </View>
    ),
    [],
  );

  return (
    <View className="flex-1 bg-bg">
      <View className="flex-row items-center">
        <View className="flex-1">
          <SearchBar onSearch={handleSearch} autoFocus />
        </View>
        <Pressable
          onPress={() => setFilterVisible(true)}
          className="mr-4 rounded-full bg-bgMuted p-2"
          style={{ minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' }}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Text className="text-lg">⚙</Text>
        </Pressable>
      </View>

      {/* Active filter chips */}
      {hasActiveFilters && (
        <View className="flex-row flex-wrap gap-2 px-4 pb-2">
          {filters.maxTime !== undefined && (
            <FilterChip
              label={`≤${filters.maxTime} min`}
              onRemove={() => handleRemoveFilter('time')}
            />
          )}
          {filters.cuisines.map((c) => (
            <FilterChip
              key={c}
              label={c}
              onRemove={() => handleRemoveFilter('cuisine', c)}
            />
          ))}
          {filters.dietary.map((d) => (
            <FilterChip
              key={d}
              label={d}
              onRemove={() => handleRemoveFilter('dietary', d)}
            />
          ))}
        </View>
      )}

      {/* Recent searches (when query is empty) */}
      {!showResults && recentSearches.length > 0 && (
        <View className="px-4 pt-2">
          <Text
            className="mb-2 text-sm"
            style={{ fontFamily: fonts.bodyMed, color: colors.inkMuted }}
          >
            Recent searches
          </Text>
          {recentSearches.map((term) => (
            <Pressable
              key={term}
              onPress={() => handleSelectRecent(term)}
              className="flex-row items-center py-3 border-b border-bgMuted"
              style={{ minHeight: 44 }}
              accessibilityRole="button"
              accessibilityLabel={`Search for ${term}`}
            >
              <SearchIcon color={colors.inkFaint} size={16} />
              <Text
                className="ml-3 text-base text-ink"
                style={{ fontFamily: fonts.body }}
              >
                {term}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Loading state */}
      {showResults && isLoading && (
        <View className="px-4 pt-4">
          {[0, 1, 2].map((i) => (
            <View key={i} className="mb-3">
              <RecipeCardSkeleton />
            </View>
          ))}
        </View>
      )}

      {/* Error state */}
      {showResults && isError && (
        <ErrorState message="Failed to load search results" onRetry={refetch} />
      )}

      {/* Empty state */}
      {showResults && !isLoading && !isError && recipes.length === 0 && (
        <EmptyState
          icon={<SearchIcon color={colors.inkFaint} size={48} />}
          title="No recipes found"
          subtitle={`No results for "${trimmedQuery}"`}
        />
      )}

      {/* Results list */}
      {showResults && !isLoading && !isError && recipes.length > 0 && (
        <FlashList
          data={recipes}
          renderItem={renderItem}
          estimatedItemSize={220}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        />
      )}

      <FilterSheet
        ref={sheetRef}
        visible={filterVisible}
        onDismiss={() => setFilterVisible(false)}
        onApply={handleApplyFilters}
      />
    </View>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <View className="flex-row items-center rounded-full bg-orangeLight px-3 py-1">
      <Text className="mr-1 text-sm text-orange">{label}</Text>
      <Pressable
        onPress={onRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${label} filter`}
      >
        <Text className="text-sm text-orange">×</Text>
      </Pressable>
    </View>
  );
}
