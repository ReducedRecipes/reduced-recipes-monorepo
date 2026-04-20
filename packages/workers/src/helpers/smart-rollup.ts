import type { ShoppingListItem, SmartRollupItem, SmartRollupResponse, SmartRollupSource } from '@rr/shared/types';
import { normaliseUnit, convertQuantity } from './unit-normalisation';
import { parseIngredient } from './ingredient-parser';

/**
 * Groups shopping list items by canonical name, sums compatible quantities,
 * and splits into unchecked / checked arrays.
 */
export function rollupItems(items: ShoppingListItem[]): SmartRollupResponse {
  const uncheckedGroups = new Map<string, BucketGroup>();
  const checkedGroups = new Map<string, BucketGroup>();

  for (const rawItem of items) {
    // If the item hasn't been parsed yet, parse inline so rollup can group
    let item = rawItem;
    if (!rawItem.item && rawItem.original_text) {
      const parsed = parseIngredient(rawItem.original_text);
      if (parsed.name) {
        item = {
          ...rawItem,
          item: parsed.name,
          quantity: rawItem.quantity ?? parsed.quantity,
          unit: rawItem.unit ?? (parsed.unit || null),
        };
      }
    }

    const canonical = canonicalise(item.item ?? item.original_text);
    const groups = item.checked ? checkedGroups : uncheckedGroups;

    if (!groups.has(canonical)) {
      groups.set(canonical, { canonical, buckets: [] });
    }

    const group = groups.get(canonical)!;
    addToBucket(group, item);
  }

  return {
    items: {
      unchecked: flattenGroups(uncheckedGroups),
      checked: flattenGroups(checkedGroups),
    },
  };
}

// ── Internal types ─────────────────────────────────────────────────

interface Bucket {
  unit: string | null; // normalised unit (null = count-based)
  totalQty: number | null;
  sources: SmartRollupSource[];
  parsing: boolean;
}

interface BucketGroup {
  canonical: string;
  buckets: Bucket[];
}

// ── Helpers ────────────────────────────────────────────────────────

function canonicalise(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Strip preparation notes after commas or common prep words
  s = s.replace(/[,(].*$/, '').trim();
  s = s.replace(/\s+(roughly|finely|thinly|freshly|coarsely|diced|minced|chopped|sliced|crushed|grated|peeled|halved|quartered|cut|stripped|torn|slivered|julienned)\b.*$/i, '').trim();
  // basic singularisation: strip trailing 's' (but not 'ss')
  if (s.length > 2 && s.endsWith('s') && !s.endsWith('ss')) {
    s = s.slice(0, -1);
  }
  return s;
}

function addToBucket(group: BucketGroup, item: ShoppingListItem): void {
  const normUnit = item.unit ? normaliseUnit(item.unit) : null;
  const source: SmartRollupSource = {
    item_id: item.id,
    recipe_id: item.recipe_id,
    quantity: item.quantity,
    original_text: item.original_text,
  };

  // Try to merge into an existing bucket with the same or convertible unit
  for (const bucket of group.buckets) {
    if (bucket.unit === normUnit) {
      // Same unit — sum directly
      bucket.totalQty = sumQty(bucket.totalQty, item.quantity);
      bucket.sources.push(source);
      if (item.parsing) bucket.parsing = true;
      return;
    }

    // Try unit conversion
    if (bucket.unit != null && normUnit != null && item.quantity != null) {
      const converted = convertQuantity(item.quantity, normUnit, bucket.unit);
      if (converted != null) {
        bucket.totalQty = sumQty(bucket.totalQty, converted);
        bucket.sources.push(source);
        if (item.parsing) bucket.parsing = true;
        return;
      }
    }
  }

  // No compatible bucket — create a new one
  group.buckets.push({
    unit: normUnit,
    totalQty: item.quantity,
    sources: [source],
    parsing: !!item.parsing,
  });
}

function sumQty(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  return (a ?? 0) + (b ?? 0);
}

function flattenGroups(groups: Map<string, BucketGroup>): SmartRollupItem[] {
  const result: SmartRollupItem[] = [];

  for (const group of groups.values()) {
    for (const bucket of group.buckets) {
      result.push({
        canonical_item: group.canonical,
        display_text: buildDisplayText(group.canonical, bucket.totalQty, bucket.unit),
        total_quantity: bucket.totalQty,
        unit: bucket.unit,
        sources: bucket.sources,
        ...(bucket.parsing ? { parsing: true } : {}),
      });
    }
  }

  return result;
}

function buildDisplayText(canonical: string, qty: number | null, unit: string | null): string {
  if (qty == null) return canonical;
  const rounded = Math.round(qty * 100) / 100;
  if (unit) return `${rounded} ${unit} ${canonical}`;
  return `${rounded} ${canonical}`;
}
