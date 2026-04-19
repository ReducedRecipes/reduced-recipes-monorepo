import type { ShoppingListItem, SmartRollupItem, SmartRollupResponse, SmartRollupSource } from '@rr/shared/types';
import { normaliseUnit, convertQuantity } from './unit-normalisation';

/**
 * Groups shopping list items by canonical name, sums compatible quantities,
 * and splits into unchecked / checked arrays.
 */
export function rollupItems(items: ShoppingListItem[]): SmartRollupResponse {
  const uncheckedGroups = new Map<string, BucketGroup>();
  const checkedGroups = new Map<string, BucketGroup>();

  for (const item of items) {
    const canonical = canonicalise(item);
    const groups = item.checked ? checkedGroups : uncheckedGroups;

    if (!groups.has(canonical)) {
      groups.set(canonical, { canonical, category: item.category ?? 'Other', buckets: [] });
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
  category: string;
  buckets: Bucket[];
}

// ── Helpers ────────────────────────────────────────────────────────

function canonicalise(item: ShoppingListItem): string {
  // Prefer backend-resolved canonical_name when available
  if (item.canonical_name) {
    return item.canonical_name.toLowerCase().trim();
  }
  // Fallback: basic lowercase + singularise
  let s = (item.item ?? item.original_text).toLowerCase().trim();
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
        category: group.category,
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
