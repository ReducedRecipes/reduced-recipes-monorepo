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



describe('EmptyState component', () => {
  const filePath = path.join(componentsDir, 'EmptyState.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
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

  it('renders centered layout with NativeWind classes', () => {
    expect(content).toContain('items-center');
    expect(content).toContain('justify-center');
    expect(content).toContain('text-center');
  });

  it('uses View and Text from react-native', () => {
    expect(content).toContain("from 'react-native'");
    expect(content).toContain('<View');
    expect(content).toContain('<Text');
  });

  it('uses theme font classes', () => {
    expect(content).toContain('font-display');
    expect(content).toContain('font-body');
  });
});

describe('ErrorState component', () => {
  const filePath = path.join(componentsDir, 'ErrorState.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
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
    expect(content).toContain('text-error');
  });

  it('renders retry button with Pressable', () => {
    expect(content).toContain('Pressable');
    expect(content).toContain('onPress={onRetry}');
    expect(content).toContain('Retry');
  });

  it('uses orange background for retry button', () => {
    expect(content).toContain('bg-orange');
  });

  it('has accessibility attributes on retry button', () => {
    expect(content).toContain('accessibilityRole="button"');
    expect(content).toContain('accessibilityLabel="Retry"');
  });
});

describe('BottomSheet component', () => {
  const filePath = path.join(componentsDir, 'BottomSheet.tsx');
  const content = fs.readFileSync(filePath, 'utf-8');

  it('exists', () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('exports BottomSheet component', () => {
    expect(content).toContain('export const BottomSheet');
  });

  it('exports BottomSheetProps interface', () => {
    expect(content).toContain('export interface BottomSheetProps');
  });

  it('wraps @gorhom/bottom-sheet', () => {
    expect(content).toContain("from '@gorhom/bottom-sheet'");
  });

  it('has default snap points', () => {
    expect(content).toContain("'25%'");
    expect(content).toContain("'50%'");
    expect(content).toContain("'90%'");
  });

  it('renders backdrop component', () => {
    expect(content).toContain('BottomSheetBackdrop');
    expect(content).toContain('backdropComponent');
  });

  it('has handle indicator styling', () => {
    expect(content).toContain('handleIndicatorStyle');
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
