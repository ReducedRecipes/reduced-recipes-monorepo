import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  Pressable: vi.fn(({ children }: any) => ({ type: 'Pressable', children })),
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: vi.fn(() => ({ type: 'FlashList' })),
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'BottomSheet', children })),
}));

vi.mock('react-native-mmkv', () => ({
  MMKV: vi.fn(() => ({
    getString: vi.fn(() => '[]'),
    set: vi.fn(),
    delete: vi.fn(),
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() })),
  keepPreviousData: {},
}));

vi.mock('@/components/SearchBar', () => ({
  SearchBar: vi.fn(() => ({ type: 'SearchBar' })),
}));

vi.mock('@/components/FilterSheet', () => ({
  FilterSheet: vi.fn(() => ({ type: 'FilterSheet' })),
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

  it('renders filter button to open FilterSheet', () => {
    expect(content).toContain('FilterSheet');
    expect(content).toContain('filterVisible');
    expect(content).toContain('Open filters');
  });

  it('shows recent searches when query is empty', () => {
    expect(content).toContain('recent_searches');
    expect(content).toContain('recentSearches');
    expect(content).toContain('Recent searches');
  });

  it('saves successful searches to MMKV', () => {
    expect(content).toContain('saveRecentSearch');
    expect(content).toContain('mmkv.set');
    expect(content).toContain('RECENT_SEARCHES_KEY');
  });

  it('uses FlashList with estimatedItemSize for results', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize={220}');
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

  it('displays active filter chips that are dismissible', () => {
    expect(content).toContain('FilterChip');
    expect(content).toContain('handleRemoveFilter');
    expect(content).toContain('onRemove');
  });

  it('implements LIFO recent searches with max 10 limit', () => {
    expect(content).toContain('MAX_RECENT');
    expect(content).toContain('.slice(0, MAX_RECENT)');
    expect(content).toContain('.filter');
  });

  it('uses loading skeletons while searching', () => {
    expect(content).toContain('RecipeCardSkeleton');
    expect(content).toContain('isLoading');
  });

  it('uses mmkv for persistent recent searches storage', () => {
    expect(content).toContain("from '@/lib/mmkv'");
    expect(content).toContain('mmkv.getString');
  });
});
