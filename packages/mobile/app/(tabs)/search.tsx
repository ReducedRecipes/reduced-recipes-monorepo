import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SearchBar } from '@/components/SearchBar';
import { RecipeCard } from '@/components/RecipeCard';
import { RecipeCardSkeleton } from '@/components/RecipeCardSkeleton';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SearchIcon } from '@/components/icons';
import {
  SearchFilterSheet,
  type SearchFilterSheetRef,
  type FullSearchFilters,
  type SearchMode,
} from '@/components/SearchFilterSheet';
import { useSearch } from '@/hooks/useSearch';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

const MODES: { label: string; value: SearchMode }[] = [
  { label: 'KEYWORD', value: 'keyword' },
  { label: 'SEMANTIC', value: 'semantic' },
  { label: 'HYBRID', value: 'hybrid' },
];

const DEFAULT_FILTERS: FullSearchFilters = {
  mode: 'keyword',
  sort: 'newest',
  dietary: [],
  method: [],
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FullSearchFilters>(DEFAULT_FILTERS);
  const filterSheetRef = useRef<SearchFilterSheetRef>(null);

  const { data, isLoading, isError, refetch, hasNextPage, isFetchingNextPage, fetchNextPage } = useSearch(query, {
    max_time: filters.maxTime,
    tag: filters.dietary.length > 0 ? filters.dietary[0]?.toLowerCase() : undefined,
  });

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const handleApplyFilters = useCallback((f: FullSearchFilters) => {
    setFilters(f);
  }, []);

  const activeFilterCount = (filters.maxTime ? 1 : 0) + filters.dietary.length + filters.method.length +
    (filters.sort !== 'newest' ? 1 : 0);

  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length >= 2;
  const recipes: RecipeSummary[] = data?.pages.flatMap((p) => p.items) ?? [];

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderItem = useCallback(
    ({ item }: { item: RecipeSummary }) => (
      <View style={s.cardWrap}>
        <RecipeCard recipe={item} />
      </View>
    ),
    [],
  );

  return (
    <View style={s.container}>
      {/* Search bar + filter button */}
      <View style={s.searchRow}>
        <View style={s.searchBarWrap}>
          <SearchBar onSearch={handleSearch} autoFocus />
        </View>
        <Pressable
          onPress={() => filterSheetRef.current?.open()}
          style={[s.filterBtn, activeFilterCount > 0 && s.filterBtnActive]}
          accessibilityRole="button"
          accessibilityLabel="Open filters"
        >
          <Text style={[s.filterBtnText, activeFilterCount > 0 && s.filterBtnTextActive]}>
            {activeFilterCount > 0 ? activeFilterCount : '⚙'}
          </Text>
        </Pressable>
      </View>

      {/* Mode toggle */}
      {showResults && (
        <View style={s.modeRow}>
          {MODES.map((m) => (
            <Pressable
              key={m.value}
              onPress={() => setFilters((f) => ({ ...f, mode: m.value }))}
              style={[s.modeChip, filters.mode === m.value && s.modeChipActive]}
            >
              <Text style={[s.modeChipText, filters.mode === m.value && s.modeChipTextActive]}>
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <View style={s.activeFiltersRow}>
          {filters.maxTime && (
            <View style={s.activeChip}>
              <Text style={s.activeChipText}>≤ {filters.maxTime} MIN</Text>
              <Pressable onPress={() => setFilters((f) => ({ ...f, maxTime: undefined }))} hitSlop={8}>
                <Text style={s.activeChipX}>×</Text>
              </Pressable>
            </View>
          )}
          {filters.dietary.map((d) => (
            <View key={d} style={s.activeChip}>
              <Text style={s.activeChipText}>{d.toUpperCase()}</Text>
              <Pressable onPress={() => setFilters((f) => ({ ...f, dietary: f.dietary.filter((x) => x !== d) }))} hitSlop={8}>
                <Text style={s.activeChipX}>×</Text>
              </Pressable>
            </View>
          ))}
          {filters.method.map((m) => (
            <View key={m} style={s.activeChip}>
              <Text style={s.activeChipText}>{m.toUpperCase()}</Text>
              <Pressable onPress={() => setFilters((f) => ({ ...f, method: f.method.filter((x) => x !== m) }))} hitSlop={8}>
                <Text style={s.activeChipX}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Initial state */}
      {!showResults && !isLoading && (
        <View style={s.initialState}>
          <SearchIcon color={colors.rule} size={64} />
          <Text style={s.initialTitle}>Find your next meal</Text>
          <Text style={s.initialSubtitle}>
            Search 159,000+ recipes by name, ingredient, or cuisine
          </Text>
        </View>
      )}

      {/* Loading state */}
      {showResults && isLoading && (
        <View style={s.skeletonWrap}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={s.cardWrap}>
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

      {/* Results */}
      {showResults && !isLoading && !isError && recipes.length > 0 && (
        <>
          <Text style={s.resultCount}>
            {recipes.length} result{recipes.length !== 1 ? 's' : ''}
            {filters.sort !== 'newest' ? ` · sorted by ${filters.sort.replace('_', ' ')}` : ''}
          </Text>
          <FlatList
            data={recipes}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardDismissMode="on-drag"
            onEndReached={handleEndReached}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={s.footer}>
                  <ActivityIndicator size="small" color={colors.accent} />
                  <Text style={s.footerText}>Loading more...</Text>
                </View>
              ) : null
            }
          />
        </>
      )}

      {/* Filter bottom sheet */}
      <SearchFilterSheet
        ref={filterSheetRef}
        filters={filters}
        onApply={handleApplyFilters}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 54,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 16,
  },
  searchBarWrap: {
    flex: 1,
  },
  filterBtn: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderColor: colors.rule,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  filterBtnText: {
    fontFamily: fonts.mono,
    fontSize: 14,
    color: colors.ink,
  },
  filterBtnTextActive: {
    color: '#FFFFFF',
  },
  modeRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: colors.rule,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modeChipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  modeChipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.inkFaint,
    letterSpacing: 1,
  },
  modeChipTextActive: {
    color: '#FFFFFF',
  },
  activeFiltersRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 6,
    marginBottom: 8,
  },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  activeChipText: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: colors.accent,
    letterSpacing: 0.5,
  },
  activeChipX: {
    fontSize: 14,
    color: colors.accent,
  },
  cardWrap: {
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  initialState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
  },
  initialTitle: {
    fontFamily: fonts.serif,
    fontSize: 24,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  initialSubtitle: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.inkFaint,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  skeletonWrap: {
    paddingTop: 8,
  },
  resultCount: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: colors.inkFaint,
    paddingHorizontal: 16,
    paddingBottom: 8,
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
