import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('expo-router', () => ({
  useLocalSearchParams: vi.fn(() => ({})),
  useRouter: vi.fn(() => ({ push: vi.fn(), back: vi.fn() })),
  Stack: { Screen: vi.fn(() => null) },
}));

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  ActivityIndicator: vi.fn(() => ({ type: 'ActivityIndicator' })),
  Pressable: vi.fn(({ children }: any) => ({ type: 'Pressable', children })),
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('expo-sqlite', () => ({
  useSQLiteContext: vi.fn(() => ({})),
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@shopify/flash-list', () => ({
  FlashList: vi.fn(() => ({ type: 'FlashList' })),
}));

vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: vi.fn(() => ({
    data: { pages: [{ items: [] }] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock('@/hooks/useSavedRecipes', () => ({
  useSavedRecipes: () => ({
    isSaved: () => false,
    save: vi.fn(),
    unsave: vi.fn(),
  }),
}));

vi.mock('@/lib/api', () => ({
  api: { recipes: { get: vi.fn() } },
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
  BookmarkIcon: vi.fn(() => ({ type: 'BookmarkIcon' })),
  SearchIcon: vi.fn(() => ({ type: 'SearchIcon' })),
}));

vi.mock('@/constants/theme', () => ({
  colors: { orange: '#FF6B35', inkMuted: '#999' },
  fonts: {},
}));

describe('TagScreen (app/tag/[tag].tsx)', () => {
  const filePath = resolve(__dirname, '../../app/tag/[tag].tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct route path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useLocalSearchParams to get tag param', () => {
    expect(content).toContain('useLocalSearchParams');
    expect(content).toContain('tag');
  });

  it('passes tag param to useRecipes', () => {
    expect(content).toContain('useRecipes');
    expect(content).toContain('tag');
  });

  it('renders header with tag name via Stack.Screen', () => {
    expect(content).toContain('Stack.Screen');
    expect(content).toContain('title');
    expect(content).toContain('tagName');
  });

  it('renders recipe list with FlashList', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize={220}');
    expect(content).toContain('RecipeCard');
  });

  it('supports infinite scroll with onEndReached', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('onEndReachedThreshold');
    expect(content).toContain('fetchNextPage');
  });

  it('shows loading skeleton state', () => {
    expect(content).toContain('isLoading');
    expect(content).toContain('RecipeCardSkeleton');
  });

  it('shows empty state when no recipes', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows error state with retry', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('onRetry');
    expect(content).toContain('refetch');
  });

  it('uses useSQLiteContext for database access', () => {
    expect(content).toContain('useSQLiteContext');
    expect(content).toContain('useSavedRecipes');
  });
});

describe('CuisineScreen (app/cuisine/[cuisine].tsx)', () => {
  const filePath = resolve(__dirname, '../../app/cuisine/[cuisine].tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct route path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useLocalSearchParams to get cuisine param', () => {
    expect(content).toContain('useLocalSearchParams');
    expect(content).toContain('cuisine');
  });

  it('passes cuisine param to useRecipes', () => {
    expect(content).toContain('useRecipes');
    expect(content).toContain('cuisine');
  });

  it('renders header with cuisine name via Stack.Screen', () => {
    expect(content).toContain('Stack.Screen');
    expect(content).toContain('title');
    expect(content).toContain('cuisineName');
  });

  it('renders recipe list with FlashList', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize={220}');
    expect(content).toContain('RecipeCard');
  });

  it('supports infinite scroll with onEndReached', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('fetchNextPage');
  });

  it('shows empty state when no recipes', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows error state with retry', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('onRetry');
  });
});

describe('DomainScreen (app/site/[domain].tsx)', () => {
  const filePath = resolve(__dirname, '../../app/site/[domain].tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct route path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useLocalSearchParams to get domain param', () => {
    expect(content).toContain('useLocalSearchParams');
    expect(content).toContain('domain');
  });

  it('passes domain param to useRecipes', () => {
    expect(content).toContain('useRecipes');
    expect(content).toContain('domain');
  });

  it('renders header with domain name via Stack.Screen', () => {
    expect(content).toContain('Stack.Screen');
    expect(content).toContain('title');
    expect(content).toContain('domainName');
  });

  it('renders recipe list with FlashList', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize={220}');
    expect(content).toContain('RecipeCard');
  });

  it('supports infinite scroll with onEndReached', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('fetchNextPage');
  });

  it('shows empty state when no recipes', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows error state with retry', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('onRetry');
  });
});
