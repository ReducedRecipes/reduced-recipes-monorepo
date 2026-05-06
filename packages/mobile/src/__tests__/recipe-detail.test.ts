import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'test-123' }),
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  Stack: { Screen: vi.fn(() => null) },
}));

vi.mock('react-native', () => ({
  Animated: {
    Value: vi.fn(() => ({
      interpolate: vi.fn(() => 0),
    })),
    View: vi.fn(({ children }: any) => ({ type: 'Animated.View', children })),
    ScrollView: vi.fn(({ children }: any) => ({ type: 'Animated.ScrollView', children })),
    event: vi.fn(),
  },
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  Pressable: vi.fn(({ children }: any) => ({ type: 'Pressable', children })),
  ScrollView: vi.fn(({ children }: any) => ({ type: 'ScrollView', children })),
  StyleSheet: { create: (s: any) => s },
  Share: { share: vi.fn() },
  Keyboard: { dismiss: vi.fn() },
}));

vi.mock('expo-image', () => ({
  Image: vi.fn(() => ({ type: 'Image' })),
}));

vi.mock('expo-web-browser', () => ({
  openBrowserAsync: vi.fn(),
}));

vi.mock('expo-sqlite', () => ({
  useSQLiteContext: () => ({}),
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@/hooks/useRecipe', () => ({
  useRecipe: vi.fn(() => ({
    data: {
      id: 'test-123',
      title: 'Test Recipe',
      source_url: 'https://example.com/recipe',
      domain: 'example.com',
      image_url: 'https://example.com/img.jpg',
      author: 'Chef Test',
      yields: '4 servings',
      prep_time: 15,
      cook_time: 30,
      total_time: 45,
      ingredients: ['1 cup flour', '2 eggs'],
      instructions: ['Mix flour', 'Add eggs', 'Bake'],
      tags: ['dinner', 'easy'],
      cuisine: 'Italian',
      category: 'Main',
      keywords: ['pasta'],
      schema_valid: true,
      extracted_at: '2024-01-01',
      last_checked: '2024-01-01',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  })),
}));

vi.mock('@/hooks/useHeart', () => ({
  useHeart: () => ({
    hearted: false,
    count: 0,
    toggle: vi.fn(),
  }),
}));

vi.mock('@/hooks/useSimilarRecipes', () => ({
  useSimilarRecipes: () => ({
    data: null,
  }),
}));

vi.mock('@/components/NutritionPanel', () => ({
  NutritionPanel: vi.fn(() => ({ type: 'NutritionPanel' })),
}));

vi.mock('@/components/RecipeCard', () => ({
  RecipeCard: vi.fn(() => ({ type: 'RecipeCard' })),
}));

vi.mock('@/components/TagPill', () => ({
  TagPill: vi.fn(() => ({ type: 'TagPill' })),
}));

vi.mock('@/components/TimeChip', () => ({
  TimeChip: vi.fn(() => ({ type: 'TimeChip' })),
}));

vi.mock('@/components/DomainBadge', () => ({
  DomainBadge: vi.fn(() => ({ type: 'DomainBadge' })),
}));

vi.mock('@/components/IngredientList', () => ({
  IngredientList: vi.fn(() => ({ type: 'IngredientList' })),
}));

vi.mock('@/components/InstructionList', () => ({
  InstructionList: vi.fn(() => ({ type: 'InstructionList' })),
}));

vi.mock('@/components/ErrorState', () => ({
  ErrorState: vi.fn(() => ({ type: 'ErrorState' })),
}));

vi.mock('@/components/icons', () => ({
  HeartIcon: vi.fn(() => ({ type: 'HeartIcon' })),
}));

vi.mock('@/constants/theme', () => ({
  colors: {
    bg: '#FAFAF8',
    bgMuted: '#F0F0EE',
    ink: '#1A1A18',
    inkMuted: '#6B7280',
    inkFaint: '#9CA3AF',
    orange: '#E85D26',
    orangeLight: '#FFF0EB',
  },
  fonts: {
    display: 'Lora_600SemiBold',
    body: 'DMSans_400Regular',
    bodyMed: 'DMSans_500Medium',
  },
  shadow: { sm: {} },
}));

const SCREEN_PATH = resolve(__dirname, '../../app/recipe/[id].tsx');

describe('Recipe Detail Screen (S-28)', () => {
  it('file exists at correct route path', () => {
    expect(existsSync(SCREEN_PATH)).toBe(true);
  });

  it('exports a default component', async () => {
    const mod = await import('../../app/recipe/[id]');
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
  });

  describe('source code structure', () => {
    const source = readFileSync(SCREEN_PATH, 'utf-8');

    it('uses useLocalSearchParams to get recipe id', () => {
      expect(source).toContain('useLocalSearchParams');
    });

    it('uses useRecipe hook to fetch recipe data', () => {
      expect(source).toContain('useRecipe');
    });

    it('uses useHeart for like functionality', () => {
      expect(source).toContain('useHeart');
    });

    it('renders hero image with expo-image', () => {
      expect(source).toContain('expo-image');
      expect(source).toContain('contentFit');
    });

    it('has animated header that fades on scroll', () => {
      expect(source).toContain('Animated');
      expect(source).toContain('scrollY');
      expect(source).toContain('interpolate');
    });

    it('has segmented control for ingredients and instructions', () => {
      expect(source).toContain('IngredientList');
      expect(source).toContain('InstructionList');
      expect(source).toContain('ingredients');
      expect(source).toContain('instructions');
    });

    it('renders tags inline', () => {
      expect(source).toContain('recipe.tags');
      expect(source).toContain('tag');
    });

    // Skipped: Start Cooking button is temporarily hidden while the cook flow's iOS crash is being diagnosed. Restore both expectations when the button is re-enabled.
    it.skip('has Start Cooking button linking to cook route', () => {
      expect(source).toContain('START COOKING');
      expect(source).toContain('/cook/');
    });

    it('has View Full Recipe button using expo-web-browser', () => {
      expect(source).toContain('expo-web-browser');
      expect(source).toContain('openBrowserAsync');
      expect(source).toContain('source_url');
    });

    it('has share functionality', () => {
      expect(source).toContain('Share.share');
      expect(source).toContain('reducedrecipes.com/recipe/');
    });

    it('displays cook time and domain metadata inline', () => {
      expect(source).toContain('cook_time');
      expect(source).toContain('recipe.domain');
    });

    it('handles loading state', () => {
      expect(source).toContain('isLoading');
      expect(source).toContain('Loading recipe');
    });

    it('handles error state with ErrorState component', () => {
      expect(source).toContain('ErrorState');
      expect(source).toContain('error');
      expect(source).toContain('refetch');
    });

    it('uses HeartIcon for like toggle', () => {
      expect(source).toContain('HeartIcon');
      expect(source).toContain('heart.toggle');
    });

    it('has proper accessibility labels', () => {
      expect(source).toContain('accessibilityLabel');
      expect(source).toContain('accessibilityRole');
    });
  });
});
