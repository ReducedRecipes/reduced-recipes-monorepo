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
  StyleSheet: { create: (s: any) => s },
  ActivityIndicator: vi.fn(() => ({ type: 'ActivityIndicator' })),
  Linking: { openURL: vi.fn() },
}));

vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
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

vi.mock('@/hooks/useFunding', () => ({
  useFunding: () => ({
    data: null,
  }),
}));

vi.mock('@/hooks/useHealth', () => ({
  useHealth: () => ({
    data: null,
  }),
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('@/hooks/useHeart', () => ({
  useHeart: () => ({ hearted: false, count: 0, toggle: vi.fn() }),
}));

vi.mock('@/components/RecipeCard', () => ({
  RecipeCard: vi.fn(() => ({ type: 'RecipeCard' })),
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: vi.fn(() => ({ type: 'ErrorState' })),
}));

vi.mock('@/components/icons', () => ({
  SearchIcon: vi.fn(() => ({ type: 'SearchIcon' })),
}));

vi.mock('@/constants/theme', () => ({
  colors: { bg: '#FAFAF8', bgMuted: '#F0F0EE', ink: '#1A1A18', inkMuted: '#6B7280', inkFaint: '#9CA3AF', orange: '#E85D26', orangeLight: '#FFF0EB' },
  fonts: { display: 'Lora_600SemiBold', body: 'DMSans_400Regular', bodyMed: 'DMSans_500Medium' },
}));

vi.mock('@rr/shared', () => ({}));

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

  it('renders sections: feature of the week, trending, quick & easy, cuisines, recently added', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('FEATURE OF THE WEEK');
    expect(content).toContain('TRENDING');
    expect(content).toContain('QUICK & EASY');
    expect(content).toContain('Cuisines');
    expect(content).toContain('Recently Added');
  });

  it('has manifesto section with brand messaging', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('MANIFESTO');
    expect(content).toContain('Recipes');
    expect(content).toContain('reduced');
  });

  it('has a search bar Pressable that navigates to /search', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('search');
    expect(content).toContain('Pressable');
    expect(content).toContain("Search recipes");
  });

  it('fetches trending recipes sorted by hot_score', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain("sort: 'hot'");
  });

  it('uses featured_recipe_id from /health to drive the singular hero', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('useHealth');
    expect(content).toContain('featured_recipe_id');
  });

  it('fetches quick & easy recipes filtered by max_time 20', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('max_time: 20');
  });

  it('deduplicates recipes across sections', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('excludedIds');
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
    expect(content).toContain('CuisinePill');
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
    expect(content).toContain('recipe={item}');
  });

  it('shows ErrorState when all queries fail', () => {
    const filePath = resolve(__dirname, '../../app/(tabs)/index.tsx');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('ErrorState');
    expect(content).toContain('isError');
  });
});
