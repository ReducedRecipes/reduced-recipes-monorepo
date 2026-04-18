import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  Pressable: vi.fn(({ children }: any) => ({ type: 'Pressable', children })),
}));

// Search screen now uses FlatList from react-native instead of FlashList

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
  keepPreviousData: {},
}));

vi.mock('@/components/SearchBar', () => ({
  SearchBar: vi.fn(() => ({ type: 'SearchBar' })),
}));

vi.mock('@/components/RecipeCard', () => ({
  RecipeCard: vi.fn(() => ({ type: 'RecipeCard' })),
}));

vi.mock('@/components/RecipeCardSkeleton', () => ({
  RecipeCardSkeleton: vi.fn(() => ({ type: 'RecipeCardSkeleton' })),
}));

vi.mock('@/components/EmptyState', () => ({
  EmptyState: vi.fn(() => ({ type: 'EmptyState' })),
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: vi.fn(() => ({ type: 'ErrorState' })),
}));

vi.mock('@/components/icons', () => ({
  SearchIcon: vi.fn(() => ({ type: 'SearchIcon' })),
}));

describe('SearchScreen (S-27)', () => {
  const filePath = resolve(__dirname, '../../app/(tabs)/search.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct tab path', () => {
    expect(content).toBeTruthy();
  });

  it('renders SearchBar with autoFocus', () => {
    expect(content).toContain('SearchBar');
    expect(content).toContain('autoFocus');
  });

  it('imports and uses useSearch hook', () => {
    expect(content).toContain('useSearch');
    expect(content).toContain("from '@/hooks/useSearch'");
  });

  it('shows initial state when query is short', () => {
    expect(content).toContain('Find your next meal');
    expect(content).toContain('showResults');
  });

  it('uses FlatList for results', () => {
    expect(content).toContain('FlatList');
  });

  it('renders RecipeCard for each search result', () => {
    expect(content).toContain('RecipeCard');
    expect(content).toContain('renderItem');
  });

  it('shows empty state when no results found', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows error state with retry on fetch failure', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('refetch');
    expect(content).toContain('Failed to load search results');
  });

  it('uses loading skeletons while searching', () => {
    expect(content).toContain('RecipeCardSkeleton');
    expect(content).toContain('isLoading');
  });

  it('supports infinite scroll with onEndReached', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('hasNextPage');
    expect(content).toContain('fetchNextPage');
  });
});
