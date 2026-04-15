import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const componentsDir = resolve(__dirname, '..', 'components');

describe('icons.tsx', () => {
  const filePath = resolve(componentsDir, 'icons.tsx');
  const content = readFileSync(filePath, 'utf8');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports HomeIcon', () => {
    expect(content).toContain('export function HomeIcon');
  });

  it('exports SearchIcon', () => {
    expect(content).toContain('export function SearchIcon');
  });

  it('exports BookmarkIcon', () => {
    expect(content).toContain('export function BookmarkIcon');
  });

  it('exports ShoppingCartIcon', () => {
    expect(content).toContain('export function ShoppingCartIcon');
  });

  it('exports SettingsIcon', () => {
    expect(content).toContain('export function SettingsIcon');
  });

  it('all icons accept color and size props', () => {
    expect(content).toContain('export interface IconProps');
    expect(content).toContain('color?:');
    expect(content).toContain('size?:');
  });

  it('uses react-native-svg', () => {
    expect(content).toContain("from 'react-native-svg'");
  });
});

describe('RecipeCard.tsx', () => {
  const filePath = resolve(componentsDir, 'RecipeCard.tsx');
  const content = readFileSync(filePath, 'utf8');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('uses expo-image for images', () => {
    expect(content).toContain("from 'expo-image'");
  });

  it('uses Lora display font for title', () => {
    expect(content).toContain('fonts.display');
  });

  it('displays domain badge', () => {
    expect(content).toContain('recipe.domain');
  });

  it('displays cook time', () => {
    expect(content).toContain('formatTime');
  });

  it('has bookmark button', () => {
    expect(content).toContain('onToggleBookmark');
    expect(content).toContain('BookmarkIcon');
  });

  it('navigates to recipe detail on press', () => {
    expect(content).toContain('/recipe/');
    expect(content).toContain('router.push');
  });

  it('meets 44pt minimum touch target', () => {
    expect(content).toContain('minHeight: 44');
    expect(content).toContain('minWidth: 44');
  });

  it('uses RecipeSummary type from shared', () => {
    expect(content).toContain("from '@rr/shared'");
    expect(content).toContain('RecipeSummary');
  });
});

describe('RecipeCardSkeleton.tsx', () => {
  const filePath = resolve(componentsDir, 'RecipeCardSkeleton.tsx');
  const content = readFileSync(filePath, 'utf8');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports RecipeCardSkeleton', () => {
    expect(content).toContain('export function RecipeCardSkeleton');
  });

  it('uses reanimated for shimmer animation', () => {
    expect(content).toContain('react-native-reanimated');
    expect(content).toContain('useSharedValue');
    expect(content).toContain('useAnimatedStyle');
  });

  it('matches RecipeCard dimensions with 16/10 aspect ratio', () => {
    expect(content).toContain('aspectRatio: 16 / 10');
  });

  it('has accessible loading label', () => {
    expect(content).toContain('Loading recipe');
  });
});
