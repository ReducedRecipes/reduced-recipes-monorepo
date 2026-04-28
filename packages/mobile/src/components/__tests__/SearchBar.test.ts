import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';

const SRC = resolve(__dirname, '../../components');

describe('SearchBar', () => {
  const filePath = resolve(SRC, 'SearchBar.tsx');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports SearchBar component', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('export function SearchBar');
  });

  it('accepts onSearch and autoFocus props', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('onSearch');
    expect(src).toContain('autoFocus');
  });

  it('implements 300ms debounce', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('300');
    expect(src).toMatch(/setTimeout|clearTimeout/);
  });

  it('has cancel button that dismisses keyboard', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('Keyboard.dismiss');
    expect(src).toContain('Cancel');
  });

  it('has accessible search input label', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('accessibilityLabel');
    expect(src).toContain('Search recipes');
  });

  it('has minimum 44pt touch target on cancel', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toMatch(/minHeight.*44|minWidth.*44/);
  });
});

describe('FilterSheet', () => {
  const filePath = resolve(SRC, 'FilterSheet.tsx');

  it('file exists', () => {
    expect(existsSync(filePath)).toBe(true);
  });

  it('exports FilterSheet component', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('export const FilterSheet');
  });

  it('exports SearchFilters type', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('export interface SearchFilters');
  });

  it('uses BottomSheet wrapper', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain("from '@/components/BottomSheet'");
  });

  it('has cook time filter options', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('15');
    expect(src).toContain('30');
    expect(src).toContain('45');
    expect(src).toContain('60');
  });

  it('has all 10 cuisine options', () => {
    const src = readFileSync(filePath, 'utf-8');
    const cuisines = [
      'Italian', 'Japanese', 'Mexican', 'Indian', 'Thai',
      'Chinese', 'French', 'American', 'Mediterranean', 'Korean',
    ];
    for (const c of cuisines) {
      expect(src).toContain(c);
    }
  });

  it('has all dietary options', () => {
    const src = readFileSync(filePath, 'utf-8');
    const dietary = ['Vegan', 'Vegetarian', 'Gluten-free', 'Dairy-free', 'Keto'];
    for (const d of dietary) {
      expect(src).toContain(d);
    }
  });

  it('has dismissible filter chips', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('Chip');
    expect(src).toContain('onRemove');
    expect(src).toContain('×');
  });

  it('has apply button', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('APPLY FILTERS');
    expect(src).toContain('onApply');
  });

  it('SearchFilters type has correct shape', () => {
    const src = readFileSync(filePath, 'utf-8');
    expect(src).toContain('maxTime');
    expect(src).toContain('cuisines: string[]');
    expect(src).toContain('dietary: string[]');
  });
});
