import { describe, it, expect } from 'vitest';
import { rollupItems } from './smart-rollup';
import type { ShoppingListItem } from '@rr/shared/types';

function makeItem(overrides: Partial<ShoppingListItem> & { id: string }): ShoppingListItem {
  return {
    shopping_list_id: 'list-1',
    recipe_id: null,
    original_text: overrides.item ?? 'item',
    quantity: null,
    unit: null,
    item: null,
    canonical_name: null,
    category: null,
    checked: 0,
    parse_failed: 0,
    parsing: 0,
    source: 'manual',
    position: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('rollupItems', () => {
  it('returns empty arrays for empty input', () => {
    const result = rollupItems([]);
    expect(result.items.unchecked).toEqual([]);
    expect(result.items.checked).toEqual([]);
  });

  it('groups items with the same canonical name and unit', () => {
    const items = [
      makeItem({ id: '1', item: 'flour', quantity: 2, unit: 'cup', original_text: '2 cups flour' }),
      makeItem({ id: '2', item: 'flour', quantity: 1, unit: 'cup', original_text: '1 cup flour' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.canonical_item).toBe('flour');
    expect(result.items.unchecked[0]!.total_quantity).toBe(3);
    expect(result.items.unchecked[0]!.unit).toBe('cup');
    expect(result.items.unchecked[0]!.sources).toHaveLength(2);
    expect(result.items.unchecked[0]!.display_text).toBe('3 cup flour');
  });

  it('converts compatible units and sums', () => {
    const items = [
      makeItem({ id: '1', item: 'sugar', quantity: 1, unit: 'kg', original_text: '1 kg sugar' }),
      makeItem({ id: '2', item: 'sugar', quantity: 500, unit: 'g', original_text: '500g sugar' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.total_quantity).toBe(1.5); // 1 kg + 500g = 1.5 kg
    expect(result.items.unchecked[0]!.unit).toBe('kg');
  });

  it('keeps incompatible units separate', () => {
    const items = [
      makeItem({ id: '1', item: 'flour', quantity: 2, unit: 'cup', original_text: '2 cups flour' }),
      makeItem({ id: '2', item: 'flour', quantity: 100, unit: 'g', original_text: '100g flour' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(2);
    const units = result.items.unchecked.map((r) => r.unit).sort();
    expect(units).toEqual(['cup', 'g']);
  });

  it('splits checked and unchecked items', () => {
    const items = [
      makeItem({ id: '1', item: 'onion', quantity: 2, unit: null, checked: 0, original_text: '2 onions' }),
      makeItem({ id: '2', item: 'onion', quantity: 1, unit: null, checked: 1, original_text: '1 onion' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.total_quantity).toBe(2);
    expect(result.items.checked).toHaveLength(1);
    expect(result.items.checked[0]!.total_quantity).toBe(1);
  });

  it('handles count-based items (no unit)', () => {
    const items = [
      makeItem({ id: '1', item: 'eggs', quantity: 3, unit: null, original_text: '3 eggs' }),
      makeItem({ id: '2', item: 'eggs', quantity: 2, unit: null, original_text: '2 eggs' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.total_quantity).toBe(5);
    expect(result.items.unchecked[0]!.unit).toBeNull();
    expect(result.items.unchecked[0]!.display_text).toBe('5 egg');
  });

  it('canonicalises names — case insensitive, singularised', () => {
    const items = [
      makeItem({ id: '1', item: 'Onions', quantity: 2, unit: null, original_text: '2 onions' }),
      makeItem({ id: '2', item: 'onion', quantity: 1, unit: null, original_text: '1 onion' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.canonical_item).toBe('onion');
    expect(result.items.unchecked[0]!.total_quantity).toBe(3);
  });

  it('includes parsing flag when any source item is parsing', () => {
    const items = [
      makeItem({ id: '1', item: 'chicken', quantity: 1, unit: 'lb', parsing: 0, original_text: '1 lb chicken' }),
      makeItem({ id: '2', item: 'chicken', quantity: null, unit: null, parsing: 1, original_text: 'chicken breast' }),
    ];
    const result = rollupItems(items);
    // Parsing item may land in a separate bucket (no unit) or same
    const allItems = result.items.unchecked;
    const parsingItem = allItems.find((i) => i.parsing);
    expect(parsingItem).toBeDefined();
  });

  it('handles items with null quantity', () => {
    const items = [
      makeItem({ id: '1', item: 'salt', quantity: null, unit: null, original_text: 'salt to taste' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.total_quantity).toBeNull();
    expect(result.items.unchecked[0]!.display_text).toBe('salt');
  });

  it('normalises unit aliases before grouping', () => {
    const items = [
      makeItem({ id: '1', item: 'milk', quantity: 2, unit: 'tablespoons', original_text: '2 tablespoons milk' }),
      makeItem({ id: '2', item: 'milk', quantity: 1, unit: 'tbsp', original_text: '1 tbsp milk' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.total_quantity).toBe(3);
    expect(result.items.unchecked[0]!.unit).toBe('tbsp');
  });

  it('tracks source details for each merged item', () => {
    const items = [
      makeItem({ id: 'a', item: 'butter', quantity: 2, unit: 'tbsp', recipe_id: 'r1', original_text: '2 tbsp butter' }),
      makeItem({ id: 'b', item: 'butter', quantity: 1, unit: 'tbsp', recipe_id: 'r2', original_text: '1 tbsp butter' }),
    ];
    const result = rollupItems(items);
    const sources = result.items.unchecked[0]!.sources;
    expect(sources).toHaveLength(2);
    expect(sources[0]).toEqual({
      item_id: 'a',
      recipe_id: 'r1',
      quantity: 2,
      original_text: '2 tbsp butter',
    });
    expect(sources[1]).toEqual({
      item_id: 'b',
      recipe_id: 'r2',
      quantity: 1,
      original_text: '1 tbsp butter',
    });
  });

  it('converts tsp to tbsp and sums', () => {
    const items = [
      makeItem({ id: '1', item: 'vanilla', quantity: 1, unit: 'tbsp', original_text: '1 tbsp vanilla' }),
      makeItem({ id: '2', item: 'vanilla', quantity: 3, unit: 'tsp', original_text: '3 tsp vanilla' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked).toHaveLength(1);
    expect(result.items.unchecked[0]!.unit).toBe('tbsp');
    // 1 tbsp + 3 tsp * (1/3) = 1 + 1 = 2 tbsp
    expect(result.items.unchecked[0]!.total_quantity).toBe(2);
  });

  it('uses original_text as fallback when item is null', () => {
    const items = [
      makeItem({ id: '1', item: null, original_text: 'Salt and Pepper' }),
    ];
    const result = rollupItems(items);
    expect(result.items.unchecked[0]!.canonical_item).toBe('salt and pepper');
  });
});
