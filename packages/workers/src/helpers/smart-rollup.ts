import type { ShoppingListItem, SmartRollupItem, SmartRollupResponse, SmartRollupSource } from '@rr/shared/types';
import { normaliseUnit, convertQuantity } from './unit-normalisation';
import { parseIngredient } from './ingredient-parser';
import { classifyIngredient } from './ingredient-category';

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

    const itemName = item.item ?? item.original_text;
    const canonical = canonicalise(itemName);
    const groups = item.checked ? checkedGroups : uncheckedGroups;

    if (!groups.has(canonical)) {
      groups.set(canonical, { canonical, displayName: cleanDisplayName(itemName), buckets: [] });
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
  canonical: string;   // sorted/normalised key for grouping
  displayName: string; // human-readable name (from first item seen)
  buckets: Bucket[];
}

// ── Helpers ────────────────────────────────────────────────────────

// Words that don't identify the ingredient itself
const STOP_WORDS = new Set(['of', 'a', 'an', 'the', 'and', 'or', 'to', 'for', 'with', 'in', 'on']);
// Form/count words: describe packaging or shape, not the ingredient
const FORM_WORDS = new Set([
  'sprig', 'clove', 'head', 'bunch', 'can', 'jar', 'bottle', 'bag',
  'box', 'pack', 'package', 'piece', 'slice', 'stalk', 'stick', 'leaf',
  'strip', 'sheet', 'dash', 'pinch', 'handful', 'knob', 'splash',
]);

function canonicalise(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Strip leading non-alpha chars (e.g. "/ 3.5 lb lamb shoulder" from bad parses)
  s = s.replace(/^[^a-z]+/, '');
  // Strip preparation notes after commas or common prep words
  s = s.replace(/[,(].*$/, '').trim();
  s = s.replace(/\b(roughly|finely|thinly|freshly|coarsely|diced|minced|chopped|sliced|crushed|grated|peeled|halved|quartered|cut|stripped|torn|slivered|julienned)\b/gi, '').trim();
  // Strip stray numbers, units, and standalone unit words that leaked through parsing
  s = s.replace(/\b\d+(\.\d+)?\s*/g, '').trim();
  s = s.replace(/\b(kg|g|lb|oz|ml|l|tsp|tbsp|cup|cups|x)\b/gi, '').trim();
  // Singularise first, THEN drop stop/form words, then sort alphabetically
  const words = s.split(/\s+/)
    .map((w) => (w.length > 2 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w && !STOP_WORDS.has(w) && !FORM_WORDS.has(w))
    .sort();
  return words.join(' ') || s; // fallback to original if all words stripped
}

/** Strip prep notes, parentheticals, and trailing instructions for display */
function cleanDisplayName(raw: string): string {
  let s = raw.toLowerCase().trim();
  // Strip parenthetical notes (including double parens)
  s = s.replace(/\(+[^)]*\)+/g, '').trim();
  // Strip everything after a comma
  s = s.replace(/,.*$/, '').trim();
  // Strip prep words
  s = s.replace(/\b(roughly|finely|thinly|freshly|coarsely|diced|minced|chopped|sliced|crushed|grated|peeled|halved|quartered|cut|stripped|torn|slivered|julienned)\b/gi, '').trim();
  // Collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  return s || raw.toLowerCase().trim();
}

function normaliseFormUnit(unit: string | null): string | null {
  if (!unit) return null;
  const norm = normaliseUnit(unit);
  // Singularise and check if it's a form/count word (not a real unit)
  let singular = norm.toLowerCase();
  if (singular.length > 2 && singular.endsWith('s') && !singular.endsWith('ss')) {
    singular = singular.slice(0, -1);
  }
  if (FORM_WORDS.has(singular)) return null;
  return norm;
}

function addToBucket(group: BucketGroup, item: ShoppingListItem): void {
  const normUnit = normaliseFormUnit(item.unit);
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
        display_text: buildDisplayText(group.displayName, bucket.totalQty, bucket.unit),
        total_quantity: bucket.totalQty,
        unit: bucket.unit,
        category: classifyIngredient(group.displayName),
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
