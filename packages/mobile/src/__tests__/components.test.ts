import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const componentsDir = path.resolve(__dirname, '../components');

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
    expect(content).toContain('#FAFAF8');
  });
});
