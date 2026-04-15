import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

vi.mock('react-native', () => ({
  Pressable: vi.fn(({ children, ...props }: any) => ({
    type: 'Pressable',
    props,
    children: typeof children === 'function' ? children({}) : children,
  })),
  Text: vi.fn(({ children, ...props }: any) => ({
    type: 'Text',
    props,
    children,
  })),
  View: vi.fn(({ children, ...props }: any) => ({
    type: 'View',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
  ScrollView: vi.fn(({ children, ...props }: any) => ({
    type: 'ScrollView',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  default: vi.fn(),
}));

vi.mock('@/components/BottomSheet', () => ({
  BottomSheet: vi.fn(({ children, ...props }: any) => ({
    type: 'BottomSheet',
    props,
    children: Array.isArray(children) ? children : [children],
  })),
}));

const SRC_PATH = resolve(__dirname, '../FilterSheet.tsx');

describe('FilterSheet', () => {
  it('exports FilterSheet component', async () => {
    const mod = await import('../FilterSheet');
    expect(mod.FilterSheet).toBeDefined();
  });

  it('exports SearchFilters type interface', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('export interface SearchFilters');
    expect(src).toContain('maxTime');
    expect(src).toContain('cuisines: string[]');
    expect(src).toContain('dietary: string[]');
  });

  it('exports FilterChipGroup as a reusable component', async () => {
    const mod = await import('../FilterSheet');
    expect(mod.FilterChipGroup).toBeDefined();
    expect(typeof mod.FilterChipGroup).toBe('function');
  });

  it('exports FilterChipGroupProps type', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(src).toContain('export interface FilterChipGroupProps');
    expect(src).toContain('options: readonly string[]');
    expect(src).toContain('selected: string[]');
    expect(src).toContain('onToggle');
  });
});

describe('FilterChipGroup', () => {
  it('renders a chip for each option', async () => {
    const { FilterChipGroup } = await import('../FilterSheet');
    const result = FilterChipGroup({
      options: ['Italian', 'Japanese', 'Mexican'],
      selected: [],
      onToggle: vi.fn(),
    }) as any;
    const json = JSON.stringify(result);
    expect(json).toContain('Italian');
    expect(json).toContain('Japanese');
    expect(json).toContain('Mexican');
  });

  it('calls onToggle with the option value when pressed', async () => {
    const onToggle = vi.fn();
    const { FilterChipGroup } = await import('../FilterSheet');
    const result = FilterChipGroup({
      options: ['Italian', 'Japanese'],
      selected: [],
      onToggle,
    }) as any;
    // Find the Italian chip by accessibilityLabel
    const italianChip = findByLabel(result, 'Italian');
    expect(italianChip).toBeDefined();
    italianChip.props.onPress();
    expect(onToggle).toHaveBeenCalledWith('Italian');
  });

  it('applies active style to selected options', async () => {
    const { FilterChipGroup } = await import('../FilterSheet');
    const result = FilterChipGroup({
      options: ['Italian', 'Japanese'],
      selected: ['Italian'],
      onToggle: vi.fn(),
    }) as any;
    const italianChip = findByLabel(result, 'Italian');
    expect(italianChip.props.className).toContain('bg-orange');
    const japaneseChip = findByLabel(result, 'Japanese');
    expect(japaneseChip.props.className).toContain('bg-bgMuted');
  });

  it('selected chip text uses white color', async () => {
    const { FilterChipGroup } = await import('../FilterSheet');
    const result = FilterChipGroup({
      options: ['Vegan'],
      selected: ['Vegan'],
      onToggle: vi.fn(),
    }) as any;
    const json = JSON.stringify(result);
    expect(json).toContain('text-white');
  });

  it('unselected chip text uses ink color', async () => {
    const { FilterChipGroup } = await import('../FilterSheet');
    const result = FilterChipGroup({
      options: ['Vegan'],
      selected: [],
      onToggle: vi.fn(),
    }) as any;
    const json = JSON.stringify(result);
    expect(json).toContain('text-ink');
  });

  it('each chip has accessible role button', async () => {
    const { FilterChipGroup } = await import('../FilterSheet');
    const result = FilterChipGroup({
      options: ['Keto'],
      selected: [],
      onToggle: vi.fn(),
    }) as any;
    const chip = findByLabel(result, 'Keto');
    expect(chip.props.accessibilityRole).toBe('button');
  });
});

describe('FilterSheet uses FilterChipGroup', () => {
  it('uses FilterChipGroup for cuisine and dietary sections', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    // FilterChipGroup should be used instead of inline map for cuisines and dietary
    const chipGroupUsages = src.match(/FilterChipGroup/g);
    // At least the component definition + 2 usages (cuisine, dietary)
    expect(chipGroupUsages!.length).toBeGreaterThanOrEqual(3);
  });

  it('does not have duplicated Pressable chip rendering for cuisines and dietary', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    // The old pattern was inline .map with Pressable for each section
    // After extraction, the FilterSheet body should use <FilterChipGroup> instead
    // Count inline Pressable renders inside the FilterSheet function (excluding cook time which is different)
    const filterSheetBody = src.slice(src.indexOf('function FilterSheet'));
    const pressableInMaps = filterSheetBody.match(/\.map\(\(.\)\s*=>\s*\(\s*<Pressable/g);
    // Should only have cook time map with Pressable, not cuisine or dietary
    expect(pressableInMaps?.length ?? 0).toBeLessThanOrEqual(1);
  });
});

function findByLabel(node: any, label: string): any {
  if (!node || typeof node !== 'object') return undefined;
  if (node.props?.accessibilityLabel === label) return node;
  // Check both React element children (props.children) and raw mock children
  const childSources = [node.props?.children, node.children];
  for (const source of childSources) {
    if (Array.isArray(source)) {
      for (const child of source) {
        const found = findByLabel(child, label);
        if (found) return found;
      }
    } else if (source && typeof source === 'object') {
      const found = findByLabel(source, label);
      if (found) return found;
    }
  }
  return undefined;
}
