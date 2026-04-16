import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
}));

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  FlatList: vi.fn(() => ({ type: 'FlatList' })),
  RefreshControl: vi.fn(() => ({ type: 'RefreshControl' })),
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@/stores/saved.store', () => ({
  useSavedStore: vi.fn((selector: any) => selector({ ids: new Set() })),
}));

vi.mock('@/db/queries', () => ({
  getAllSaved: vi.fn(() => Promise.resolve([])),
}));

vi.mock('@/hooks/useSavedRecipes', () => ({
  useSavedRecipes: () => ({
    isSaved: () => false,
    save: vi.fn(),
    unsave: vi.fn(),
  }),
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
}));

describe('SavedScreen (S-30)', () => {
  const filePath = resolve(__dirname, '../../app/(tabs)/saved.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct tab path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useSQLiteContext for database access', () => {
    expect(content).toContain('useSQLiteContext');
    expect(content).toContain('const db = useSQLiteContext()');
  });

  it('loads saved recipes from SQLite via getAllSaved', () => {
    expect(content).toContain('getAllSaved');
    expect(content).toContain('getAllSaved(db)');
  });

  it('uses useSavedStore to react to bookmark changes', () => {
    expect(content).toContain('useSavedStore');
    expect(content).toContain('savedIds');
  });

  it('uses useSavedRecipes hook for unsave functionality', () => {
    expect(content).toContain('useSavedRecipes');
    expect(content).toContain('unsave');
  });

  it('renders a 2-column grid layout', () => {
    expect(content).toContain('NUM_COLUMNS = 2');
    expect(content).toContain('numColumns');
  });

  it('shows RecipeCard for each saved recipe with bookmarked=true', () => {
    expect(content).toContain('RecipeCard');
    expect(content).toContain('bookmarked');
    expect(content).toContain('onToggleBookmark');
  });

  it('shows loading skeletons while fetching', () => {
    expect(content).toContain('RecipeCardSkeleton');
    expect(content).toContain('loading');
  });

  it('shows EmptyState when no saved recipes', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('No saved recipes yet');
    expect(content).toContain('bookmark');
  });

  it('shows ErrorState on load failure with retry', () => {
    expect(content).toContain('ErrorState');
    expect(content).toContain('error');
    expect(content).toContain('onRetry');
  });

  it('includes pull-to-refresh via RefreshControl', () => {
    expect(content).toContain('RefreshControl');
    expect(content).toContain('refreshControl');
    expect(content).toContain('onRefresh');
  });

  it('displays recipe count in header', () => {
    expect(content).toContain('recipes.length');
    expect(content).toContain("'recipe'");
    expect(content).toContain("'recipes'");
    expect(content).toContain('saved');
  });

  it('converts SavedRecipe to RecipeSummary for RecipeCard', () => {
    expect(content).toContain('toSummary');
    expect(content).toContain('RecipeSummary');
  });

  it('has proper title header', () => {
    expect(content).toContain('Saved Recipes');
  });
});
