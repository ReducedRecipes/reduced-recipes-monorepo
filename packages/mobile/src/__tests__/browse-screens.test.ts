import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('expo-router', () => ({
  useLocalSearchParams: vi.fn(() => ({})),
  useRouter: vi.fn(() => ({ back: vi.fn(), push: vi.fn() })),
  Stack: { Screen: vi.fn(() => ({ type: 'Stack.Screen' })) },
}));

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  Pressable: vi.fn(({ children }: any) => ({ type: 'Pressable', children })),
  ActivityIndicator: vi.fn(() => ({ type: 'ActivityIndicator' })),
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
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
    data: { pages: [{ items: [], next_cursor: null }] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  })),
}));

vi.mock('@/components/RecipeCard', () => ({
  RecipeCard: vi.fn(() => ({ type: 'RecipeCard' })),
}));

vi.mock('@/components/EmptyState', () => ({
  EmptyState: vi.fn(() => ({ type: 'EmptyState' })),
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: vi.fn(() => ({ type: 'ErrorState' })),
}));

vi.mock('@/components/icons', () => ({
  BookmarkIcon: vi.fn(() => ({ type: 'BookmarkIcon' })),
}));

describe('TagScreen (S-33)', () => {
  const filePath = resolve(__dirname, '../../app/tag/[tag].tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct route path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useLocalSearchParams to get tag param', () => {
    expect(content).toContain('useLocalSearchParams');
    expect(content).toContain('tag');
  });

  it('passes tag filter to useRecipes', () => {
    expect(content).toContain('useRecipes');
    expect(content).toContain('{ tag }');
  });

  it('renders header with capitalized tag name', () => {
    expect(content).toContain('displayName');
    expect(content).toContain('toUpperCase');
    expect(content).toContain('title');
  });

  it('renders recipe list with FlashList', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize');
    expect(content).toContain('RecipeCard');
  });

  it('supports infinite scroll pagination', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('fetchNextPage');
    expect(content).toContain('onEndReachedThreshold');
    expect(content).toContain('hasNextPage');
  });

  it('shows EmptyState when no recipes found', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows ErrorState with retry on failure', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('onRetry');
    expect(content).toContain('refetch');
  });

  it('shows loading indicator while fetching', () => {
    expect(content).toContain('isLoading');
    expect(content).toContain('ActivityIndicator');
  });

  it('has back button navigation', () => {
    expect(content).toContain('router.back');
    expect(content).toContain('Go back');
  });
});

describe('CuisineScreen (S-33)', () => {
  const filePath = resolve(__dirname, '../../app/cuisine/[cuisine].tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct route path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useLocalSearchParams to get cuisine param', () => {
    expect(content).toContain('useLocalSearchParams');
    expect(content).toContain('cuisine');
  });

  it('passes cuisine filter to useRecipes', () => {
    expect(content).toContain('useRecipes');
    expect(content).toContain('{ cuisine }');
  });

  it('renders header with capitalized cuisine name', () => {
    expect(content).toContain('displayName');
    expect(content).toContain('toUpperCase');
    expect(content).toContain('title');
  });

  it('renders recipe list with FlashList', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize');
    expect(content).toContain('RecipeCard');
  });

  it('supports infinite scroll pagination', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('fetchNextPage');
    expect(content).toContain('hasNextPage');
  });

  it('shows EmptyState when no recipes found', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows ErrorState with retry on failure', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('onRetry');
    expect(content).toContain('refetch');
  });

  it('has back button navigation', () => {
    expect(content).toContain('router.back');
    expect(content).toContain('Go back');
  });
});

describe('DomainScreen (S-33)', () => {
  const filePath = resolve(__dirname, '../../app/site/[domain].tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct route path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useLocalSearchParams to get domain param', () => {
    expect(content).toContain('useLocalSearchParams');
    expect(content).toContain('domain');
  });

  it('passes domain filter to useRecipes', () => {
    expect(content).toContain('useRecipes');
    expect(content).toContain('{ domain }');
  });

  it('renders header with domain name', () => {
    expect(content).toContain('title');
    expect(content).toContain('domain');
  });

  it('renders recipe list with FlashList', () => {
    expect(content).toContain('FlashList');
    expect(content).toContain('estimatedItemSize');
    expect(content).toContain('RecipeCard');
  });

  it('supports infinite scroll pagination', () => {
    expect(content).toContain('onEndReached');
    expect(content).toContain('fetchNextPage');
    expect(content).toContain('hasNextPage');
  });

  it('shows EmptyState when no recipes found', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No recipes found');
  });

  it('shows ErrorState with retry on failure', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('onRetry');
    expect(content).toContain('refetch');
  });

  it('has back button navigation', () => {
    expect(content).toContain('router.back');
    expect(content).toContain('Go back');
  });
});
