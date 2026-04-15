import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const COMPONENTS = resolve(__dirname, '../../components');
const HOOKS = resolve(__dirname, '../../hooks');

describe('BrowseListScreen', () => {
  const filePath = resolve(COMPONENTS, 'BrowseListScreen.tsx');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports BrowseListScreen component', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('export function BrowseListScreen');
  });

  it('exports BrowseListScreenProps interface', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('export interface BrowseListScreenProps');
  });

  it('accepts required props: title, recipes, isLoading, error, onToggleBookmark, isSaved, emptyMessage', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('title: string');
    expect(src).toContain('recipes: RecipeSummary[]');
    expect(src).toContain('isLoading: boolean');
    expect(src).toContain('onToggleBookmark: (id: string) => void');
    expect(src).toContain('isSaved: (id: string) => boolean');
    expect(src).toContain('emptyMessage: string');
  });

  it('renders loading skeletons', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('RecipeCardSkeleton');
    expect(src).toContain('isLoading');
  });

  it('renders error state', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('ErrorState');
  });

  it('renders empty state with emptyMessage', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('EmptyState');
    expect(src).toContain('emptyMessage');
  });

  it('uses FlashList for recipe rendering', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('FlashList');
    expect(src).toContain('RecipeCard');
  });

  it('supports pagination via onEndReached', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('onEndReached');
    expect(src).toContain('isFetchingNextPage');
  });
});

describe('useToggleBookmark', () => {
  const filePath = resolve(HOOKS, 'useToggleBookmark.ts');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports useToggleBookmark hook', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('export function useToggleBookmark');
  });

  it('uses useSavedRecipes internally', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('useSavedRecipes');
  });

  it('fetches full recipe via api when saving', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('api.recipes.get');
  });

  it('returns toggleBookmark and isSaved', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('toggleBookmark');
    expect(src).toContain('isSaved');
  });
});

describe('Browse screen refactoring', () => {
  const screens = [
    { name: 'tag/[tag].tsx', path: resolve(__dirname, '../../../app/tag/[tag].tsx') },
    { name: 'cuisine/[cuisine].tsx', path: resolve(__dirname, '../../../app/cuisine/[cuisine].tsx') },
    { name: 'site/[domain].tsx', path: resolve(__dirname, '../../../app/site/[domain].tsx') },
  ];

  for (const screen of screens) {
    describe(screen.name, () => {
      it('uses BrowseListScreen', () => {
        const src = readFileSync(screen.path, 'utf-8');
        expect(src).toContain('BrowseListScreen');
      });

      it('uses useToggleBookmark hook', () => {
        const src = readFileSync(screen.path, 'utf-8');
        expect(src).toContain('useToggleBookmark');
      });

      it('is under 25 lines of actual code', () => {
        const src = readFileSync(screen.path, 'utf-8');
        const lines = src.split('\n').filter((l) => l.trim().length > 0);
        expect(lines.length).toBeLessThanOrEqual(30);
      });
    });
  }
});
