import { describe, it, expect, vi } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';

vi.mock('react-native', () => ({
  View: vi.fn(({ children }: any) => ({ type: 'View', children })),
  Text: vi.fn(({ children }: any) => ({ type: 'Text', children })),
  TouchableOpacity: vi.fn(({ children }: any) => ({ type: 'TouchableOpacity', children })),
  SectionList: vi.fn(() => ({ type: 'SectionList' })),
  TextInput: vi.fn(() => ({ type: 'TextInput' })),
  Alert: { alert: vi.fn() },
  Share: { share: vi.fn() },
}));

vi.mock('react-native-svg', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'Svg', children })),
  Path: vi.fn(() => ({ type: 'Path' })),
}));

vi.mock('@gorhom/bottom-sheet', () => ({
  default: vi.fn(({ children }: any) => ({ type: 'BottomSheet', children })),
  BottomSheetBackdrop: vi.fn(() => ({ type: 'BottomSheetBackdrop' })),
}));

vi.mock('@/hooks/useShoppingList', () => ({
  useShoppingList: () => ({
    items: [],
    toggle: vi.fn(),
    remove: vi.fn(),
    addManual: vi.fn(),
    clearChecked: vi.fn(),
    clearAll: vi.fn(),
    groupedByCategory: {},
    checkedCount: 0,
    totalCount: 0,
  }),
}));

vi.mock('@/components/BottomSheet', () => ({
  BottomSheet: vi.fn(({ children }: any) => ({ type: 'BottomSheet', children })),
}));

vi.mock('@/components/EmptyState', () => ({
  EmptyState: vi.fn(() => ({ type: 'EmptyState' })),
}));

vi.mock('@/components/icons', () => ({
  ShoppingCartIcon: vi.fn(() => ({ type: 'ShoppingCartIcon' })),
}));

vi.mock('@/stores/shopping.store', () => ({
  useShoppingStore: vi.fn((selector: any) => selector({ items: [] })),
}));

describe('ShoppingListScreen (S-31)', () => {
  const filePath = resolve(__dirname, '../../app/(tabs)/list.tsx');
  const content = readFileSync(filePath, 'utf-8');

  it('file exists at correct tab path', () => {
    expect(content).toBeTruthy();
  });

  it('uses useShoppingList hook', () => {
    expect(content).toContain('useShoppingList');
    expect(content).toContain("from '@/hooks/useShoppingList'");
  });

  it('renders empty state when no items', () => {
    expect(content).toContain('EmptyState');
    expect(content).toContain('Your shopping list is empty');
    expect(content).toContain('Add ingredients from recipe pages');
  });

  it('renders grouped items by category', () => {
    expect(content).toContain('groupedByCategory');
    expect(content).toContain('SectionList');
    expect(content).toContain('PRODUCE');
    expect(content).toContain('DAIRY');
    expect(content).toContain('MEAT');
    expect(content).toContain('PANTRY');
    expect(content).toContain('SPICES');
    expect(content).toContain('OTHER');
  });

  it('toggles checked state on item press', () => {
    expect(content).toContain('toggle(item.id)');
    expect(content).toContain('item.checked');
    expect(content).toContain('line-through');
  });

  it('adds manual items via bottom sheet', () => {
    expect(content).toContain('addManual');
    expect(content).toContain('BottomSheet');
    expect(content).toContain('TextInput');
    expect(content).toContain('handleAddManual');
    expect(content).toContain('Add to list');
  });

  it('clears completed items with confirmation', () => {
    expect(content).toContain('clearChecked');
    expect(content).toContain('Clear completed');
    expect(content).toContain('Alert.alert');
    expect(content).toContain('destructive');
  });

  it('shows recipe pills row', () => {
    expect(content).toContain('recipePills');
    expect(content).toContain('recipeId');
    expect(content).toContain('recipeTitle');
    expect(content).toContain('handleRemoveRecipeItems');
  });

  it('supports sharing the list', () => {
    expect(content).toContain('Share.share');
    expect(content).toContain('Share list');
    expect(content).toContain('handleShare');
  });

  it('has Shopping List header with Add button', () => {
    expect(content).toContain('Shopping List');
    expect(content).toContain('+ Add');
    expect(content).toContain('openAddSheet');
  });

  it('sorts checked items to bottom within category', () => {
    expect(content).toContain('a.checked');
    expect(content).toContain('b.checked');
    expect(content).toContain('.sort');
  });

  it('renders checkbox with checked styling', () => {
    expect(content).toContain('checkboxChecked');
    expect(content).toContain('checkboxUnchecked');
    expect(content).toContain('colors.orange');
    expect(content).toContain('colors.inkFaint');
  });
});
