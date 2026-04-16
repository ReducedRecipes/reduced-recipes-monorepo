import React, { useCallback, useState } from 'react';
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
import { useSearch } from '@/hooks/useSearch';
import { colors, fonts } from '@/constants/theme';
import type { RecipeSummary } from '@rr/shared';

export default function SearchScreen() {
  const [query, setQuery] = useState('');

  const { data, isLoading, isError, refetch } = useSearch(query);

  const handleSearch = useCallback((text: string) => {
    setQuery(text);
  }, []);

  const trimmedQuery = query.trim();
  const showResults = trimmedQuery.length >= 2;
  const recipes: RecipeSummary[] = data ?? [];

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
      {/* Search bar */}
      <View style={s.searchWrap}>
        <SearchBar onSearch={handleSearch} autoFocus />
      </View>

      {/* Initial state */}
      {!showResults && !isLoading && (
        <View style={s.initialState}>
          <SearchIcon color={colors.bgMuted} size={64} />
          <Text style={s.initialTitle}>Find your next meal</Text>
          <Text style={s.initialSubtitle}>
            Search 56,000+ recipes by name, ingredient, or cuisine
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
          </Text>
          <FlatList
            data={recipes}
            renderItem={renderItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardDismissMode="on-drag"
          />
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: 54,
  },
  searchWrap: {},
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
    fontFamily: fonts.display,
    fontSize: 22,
    color: colors.ink,
    marginTop: 16,
    textAlign: 'center',
  },
  initialSubtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.inkMuted,
    marginTop: 8,
    textAlign: 'center',
    lineHeight: 20,
  },
  skeletonWrap: {
    paddingTop: 8,
  },
  resultCount: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.inkMuted,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
});
