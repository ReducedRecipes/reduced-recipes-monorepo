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

  it('uses View-based shimmer blocks for skeleton placeholders', () => {
    expect(content).toContain('ShimmerBlock');
    expect(content).toContain('backgroundColor');
    expect(content).toContain('opacity');
  });

  it('matches RecipeCard dimensions with 16/10 aspect ratio', () => {
    expect(content).toContain('aspectRatio: 16 / 10');
  });

  it('has accessible loading label', () => {
    expect(content).toContain('Loading recipe');
  });
});

describe('EmptyState component', () => {
  const filePath = resolve(componentsDir, 'EmptyState.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports EmptyState function', () => {
    expect(content).toContain('export function EmptyState');
  });

  it('exports EmptyStateProps interface', () => {
    expect(content).toContain('export interface EmptyStateProps');
  });

  it('accepts icon, title, and subtitle props', () => {
    expect(content).toContain('icon');
    expect(content).toContain('title');
    expect(content).toContain('subtitle');
  });

  it('renders centered layout with StyleSheet', () => {
    expect(content).toContain("alignItems: 'center'");
    expect(content).toContain("justifyContent: 'center'");
    expect(content).toContain("textAlign: 'center'");
  });

  it('uses View and Text from react-native', () => {
    expect(content).toContain("from 'react-native'");
    expect(content).toContain('<View');
    expect(content).toContain('<Text');
  });

  it('uses theme fonts from constants', () => {
    expect(content).toContain('fonts.display');
    expect(content).toContain('fonts.body');
  });
});

describe('ErrorState component', () => {
  const filePath = resolve(componentsDir, 'ErrorState.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports ErrorState function', () => {
    expect(content).toContain('export function ErrorState');
  });

  it('exports ErrorStateProps interface', () => {
    expect(content).toContain('export interface ErrorStateProps');
  });

  it('accepts message and onRetry props', () => {
    expect(content).toContain('message');
    expect(content).toContain('onRetry');
  });

  it('renders error message with error color', () => {
    expect(content).toContain('colors.error');
  });

  it('renders retry button with Pressable', () => {
    expect(content).toContain('Pressable');
    expect(content).toContain('onPress={onRetry}');
    expect(content).toContain('Retry');
  });

  it('uses orange background for retry button', () => {
    expect(content).toContain('colors.orange');
  });

  it('has accessibility attributes on retry button', () => {
    expect(content).toContain('accessibilityRole="button"');
    expect(content).toContain('accessibilityLabel="Retry"');
  });
});

describe('BottomSheet component', () => {
  const filePath = resolve(componentsDir, 'BottomSheet.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports BottomSheet component', () => {
    expect(content).toContain('export const BottomSheet');
  });

  it('exports BottomSheetProps interface', () => {
    expect(content).toContain('export interface BottomSheetProps');
  });

  it('uses Modal from react-native', () => {
    expect(content).toContain("Modal");
    expect(content).toContain("from 'react-native'");
  });

  it('supports snapPoints and onClose props', () => {
    expect(content).toContain('snapPoints');
    expect(content).toContain('onClose');
  });

  it('renders backdrop as a Pressable overlay', () => {
    expect(content).toContain('backdrop');
    expect(content).toContain('Pressable');
  });

  it('has handle indicator styling', () => {
    expect(content).toContain('handle');
  });

  it('supports enablePanDownToClose', () => {
    expect(content).toContain('enablePanDownToClose');
  });

  it('uses forwardRef for imperative control', () => {
    expect(content).toContain('forwardRef');
  });

  it('uses theme background color', () => {
    expect(content).toContain('#FAFAF8');  });
});
