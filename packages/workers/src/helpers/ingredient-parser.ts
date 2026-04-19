/**
 * Ingredient parser for shopping list items.
 *
 * Two-stage approach (mirrors dietary inference pattern):
 * 1. Rule-based regex extraction of quantity, unit, and item name.
 * 2. Workers AI fallback for ambiguous/unparseable strings.
 */

import { normaliseUnit } from './unit-normalisation';

export interface ParsedIngredient {
  name: string;
  canonical_name: string;
  quantity: number | null;
  unit: string;
  original_text: string;
}

// ── Unicode fraction map ────────────────────────────────────────────

const UNICODE_FRACTIONS: Record<string, number> = {
  '½': 0.5,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '¼': 0.25,
  '¾': 0.75,
  '⅕': 0.2,
  '⅖': 0.4,
  '⅗': 0.6,
  '⅘': 0.8,
  '⅙': 1 / 6,
  '⅚': 5 / 6,
  '⅛': 0.125,
  '⅜': 0.375,
  '⅝': 0.625,
  '⅞': 0.875,
};

// ── Known units for regex matching ──────────────────────────────────

const UNIT_WORDS = [
  'teaspoons?', 'tsps?', 'tablespoons?', 'tbsps?',
  'cups?', 'ounces?', 'oz', 'pounds?', 'lbs?',
  'grams?', 'g', 'kilograms?', 'kgs?', 'kg',
  'milliliters?', 'millilitres?', 'mls?', 'ml',
  'liters?', 'litres?', 'l',
  'pieces?', 'pcs?',
  'cloves?', 'bunche?s?', 'pinche?s?', 'dashe?s?',
  'cans?', 'slices?', 'sprigs?',
  'stalks?', 'heads?', 'sticks?',
];

const UNIT_PATTERN = UNIT_WORDS.join('|');

// ── Regex patterns ──────────────────────────────────────────────────

// Match fraction like 1/2, 3/4
const FRACTION_RE = /(\d+)\s*\/\s*(\d+)/;

// Match a number: integer, decimal, fraction, or mixed (e.g. "1 1/2")
const NUMBER_RE =
  /(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)/;

// Full ingredient pattern: optional qty, optional unit, then item name
// Handles: "2 cups flour", "1/2 tsp salt", "flour", "1 (14 oz) can tomatoes"
const INGREDIENT_RE = new RegExp(
  `^\\s*` +
  // Optional quantity (integer, decimal, fraction, mixed, range, unicode)
  `(?:` +
    `(\\d+(?:\\.\\d+)?\\s*-\\s*\\d+(?:\\.\\d+)?)` + // range: 2-3
    `|` +
    `(\\d+\\s+\\d+\\s*/\\s*\\d+)` + // mixed: 1 1/2
    `|` +
    `(\\d+\\s*/\\s*\\d+)` + // fraction: 1/2
    `|` +
    `(\\d+(?:\\.\\d+)?)` + // integer or decimal: 2, 2.5
  `)?` +
  `\\s*` +
  // Optional unicode fraction after number
  `([${Object.keys(UNICODE_FRACTIONS).join('')}])?` +
  `\\s*` +
  // Optional parenthetical like (14 oz) before unit
  `(?:\\(([^)]+)\\)\\s*)?` +
  `\\s*` +
  // Optional unit
  `(?:\\b(${UNIT_PATTERN})\\b\\.?)?` +
  `\\s*` +
  // Optional "of"
  `(?:of\\s+)?` +
  // Item name (rest of the string)
  `(.+)`,
  'i',
);

// ── Descriptor words to strip from item names ───────────────────────

const DESCRIPTORS = [
  'large', 'small', 'medium',
  'chopped', 'diced', 'minced', 'sliced', 'crushed', 'grated',
  'fresh', 'dried', 'frozen', 'whole', 'ground',
  'finely', 'roughly', 'thinly', 'coarsely',
];

const DESCRIPTOR_RE = new RegExp(
  `\\b(${DESCRIPTORS.join('|')})\\b`,
  'gi',
);

/**
 * Strip descriptor words (large, chopped, diced, etc.) from an item name
 * to produce cleaner names for canonical lookup.
 */
function stripDescriptors(name: string): string {
  return name
    .replace(DESCRIPTOR_RE, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

// ── Helpers ─────────────────────────────────────────────────────────

function parseFraction(str: string): number {
  const match = str.match(FRACTION_RE);
  if (!match) return parseFloat(str) || 0;
  return parseInt(match[1]!, 10) / parseInt(match[2]!, 10);
}

function parseQuantity(
  range: string | undefined,
  mixed: string | undefined,
  fraction: string | undefined,
  decimal: string | undefined,
  unicodeFrac: string | undefined,
): number | null {
  let qty: number | null = null;

  if (range) {
    // Take the average of a range like "2-3"
    const parts = range.split('-').map((s) => parseFloat(s.trim()));
    qty = (parts[0]! + parts[1]!) / 2;
  } else if (mixed) {
    // "1 1/2" → 1.5
    const parts = mixed.trim().split(/\s+/);
    const whole = parseInt(parts[0]!, 10);
    const frac = parseFraction(parts[1]!);
    qty = whole + frac;
  } else if (fraction) {
    qty = parseFraction(fraction);
  } else if (decimal) {
    qty = parseFloat(decimal);
  }

  // Add unicode fraction
  if (unicodeFrac && UNICODE_FRACTIONS[unicodeFrac] != null) {
    qty = (qty ?? 0) + UNICODE_FRACTIONS[unicodeFrac];
  }

  return qty;
}

/**
 * Basic singularisation: remove trailing 's' (or 'es' for specific words).
 * Handles common ingredient plurals without a full NLP library.
 */
function singularise(word: string): string {
  const lower = word.toLowerCase().trim();
  if (lower.length <= 2) return lower;

  // Common -es endings
  if (lower.endsWith('ches') || lower.endsWith('shes')) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('oes')) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('ies')) {
    return lower.slice(0, -3) + 'y';
  }
  if (lower.endsWith('ves')) {
    return lower.slice(0, -3) + 'f';
  }
  if (lower.endsWith('ses') || lower.endsWith('zes')) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('s') && !lower.endsWith('ss')) {
    return lower.slice(0, -1);
  }
  return lower;
}

function canonicalise(name: string): string {
  return singularise(name.toLowerCase().trim());
}

// ── Main parser ─────────────────────────────────────────────────────

/**
 * Parse a raw ingredient string into structured data.
 * Rule-based: uses regex to extract quantity, unit, and item name.
 */
export function parseIngredient(raw: string): ParsedIngredient {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      name: '',
      canonical_name: '',
      quantity: null,
      unit: '',
      original_text: raw,
    };
  }

  // Replace unicode fractions in the string for regex matching
  let normalised = trimmed;
  for (const [char, _val] of Object.entries(UNICODE_FRACTIONS)) {
    normalised = normalised.replace(new RegExp(char, 'g'), ` ${char} `);
  }

  // Insert space between number and unit when directly attached (e.g. "500g" → "500 g")
  normalised = normalised.replace(
    new RegExp(`(\\d)\\s*(${UNIT_PATTERN})\\b`, 'i'),
    '$1 $2',
  );

  const match = normalised.match(INGREDIENT_RE);

  if (!match) {
    // Couldn't parse — return the whole string as the name
    return {
      name: trimmed,
      canonical_name: canonicalise(trimmed),
      quantity: null,
      unit: '',
      original_text: raw,
    };
  }

  const [, rangeStr, mixedStr, fractionStr, decimalStr, unicodeFrac, _paren, unitStr, nameStr] = match;

  const quantity = parseQuantity(rangeStr, mixedStr, fractionStr, decimalStr, unicodeFrac);

  // Normalise unit through the unit-normalisation helper
  const unit = unitStr ? normaliseUnit(unitStr) : '';

  // Clean up the item name
  let name = (nameStr || '').trim();
  // Remove leading commas, dashes, or "of"
  name = name.replace(/^[,\-–—]\s*/, '').trim();
  // Remove trailing punctuation
  name = name.replace(/[.,;]+$/, '').trim();
  // Strip descriptor words for cleaner canonical names
  name = stripDescriptors(name);

  return {
    name,
    canonical_name: canonicalise(name),
    quantity,
    unit,
    original_text: raw,
  };
}

// ── AI fallback ─────────────────────────────────────────────────────

/**
 * Parse an ingredient string using Workers AI as a fallback
 * for items the regex-based parser cannot handle.
 */
export async function parseIngredientWithAI(
  raw: string,
  ai: Ai,
): Promise<ParsedIngredient> {
  try {
    const result = (await ai.run('@cf/meta/llama-3-8b-instruct', {
      messages: [
        {
          role: 'system',
          content: `You are an ingredient parser. Given a raw ingredient string, extract the structured data.
Respond ONLY with a JSON object: {"name": "item name", "quantity": number or null, "unit": "unit or empty string"}
Examples:
- "2 cups flour" → {"name": "flour", "quantity": 2, "unit": "cups"}
- "salt and pepper to taste" → {"name": "salt and pepper", "quantity": null, "unit": ""}
- "1 (14 oz) can diced tomatoes" → {"name": "diced tomatoes", "quantity": 14, "unit": "oz"}`,
        },
        { role: 'user', content: raw },
      ],
    })) as { response?: string };

    if (result?.response) {
      const jsonMatch = result.response.match(/\{.*\}/s);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const name = typeof parsed.name === 'string' ? parsed.name.trim() : raw;
        const unit = typeof parsed.unit === 'string' ? normaliseUnit(parsed.unit) : '';
        const quantity = typeof parsed.quantity === 'number' ? parsed.quantity : null;

        return {
          name,
          canonical_name: canonicalise(name),
          quantity,
          unit,
          original_text: raw,
        };
      }
    }
  } catch {
    // AI failure — fall through to rule-based
  }

  // Fallback to rule-based parser
  return parseIngredient(raw);
}

// Export internals for testing
export { canonicalise, singularise, parseQuantity, stripDescriptors };
