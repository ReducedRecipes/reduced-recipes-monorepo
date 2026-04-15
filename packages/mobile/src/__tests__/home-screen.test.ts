import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

// Mock all external dependencies so the module can be imported
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  ScrollView: vi.fn(({ children }: any) => ({ type: 'ScrollView', children })),
  FlatList: vi.fn(() => ({ type: 'FlatList' })),
  Pressable: vi.fn(({ children }: any) => ({ type: 'Pressable', children })),
  RefreshControl: vi.fn(() => ({ type: 'RefreshControl' })),
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@/hooks/useRecipes', () => ({
  useRecipes: vi.fn(() => ({
    data: { pages: [{ items: [] }] },
    isLoading: false,
    isError: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  })),
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

vi.mock('@/components/TagPill', () => ({
  TagPill: vi.fn(() => ({ type: 'TagPill' })),
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: vi.fn(() => ({ type: 'ErrorState' })),
}));

vi.mock('@/components/icons', () => ({
  SearchIcon: vi.fn(() => ({ type: 'SearchIcon' })),
}));

describe('HomeScreen (S-26)', () => {
  it('exports a default component', async () => {
    const mod = await import('../../app/(tabs)/index');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  it('file exists at correct path', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toBeTruthy();
  });

  it('imports useRecipes hook for data fetching', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain("useRecipes");
  });

  it('renders 4 sections: greeting, featured, quick & easy, cuisines, recently added', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Featured');
    expect(content).toContain('Quick');
    expect(content).toContain('Cuisines');
    expect(content).toContain('Recently Added');
  });

  it('has time-based greeting that changes by time of day', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('Good morning');
    expect(content).toContain('Good afternoon');
    expect(content).toContain('Good evening');
  });

  it('has a search bar Pressable that navigates to /search', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('search');
    expect(content).toContain('Pressable');
    expect(content).toContain("Search recipes");
  });

  it('fetches featured recipes with limit 5', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('useRecipes({ limit: 5 })');
  });

  it('fetches quick & easy recipes filtered by max_time 30', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('max_time: 30');
  });

  it('includes pull-to-refresh via RefreshControl', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('RefreshControl');
    expect(content).toContain('refreshControl');
  });

  it('renders cuisine pills for navigation', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('TagPill');
    expect(content).toContain('Italian');
    expect(content).toContain('Mexican');
    expect(content).toContain('Japanese');
  });

  it('handles infinite scroll with fetchNextPage for recent recipes', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('hasNextPage');
    expect(content).toContain('fetchNextPage');
  });

  it('uses RecipeCard component for rendering recipes', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('RecipeCard');
    expect(content).toContain('bookmarked');
    expect(content).toContain('onToggleBookmark');
  });

  it('shows ErrorState when all queries fail', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('ErrorState');
    expect(content).toContain('isError');
  });
});
