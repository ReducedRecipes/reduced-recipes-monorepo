const FRACTIONS: Record<string, string> = {
  "0.125": "⅛",
  "0.25": "¼",
  "0.333": "⅓",
  "0.375": "⅜",
  "0.5": "½",
  "0.625": "⅝",
  "0.667": "⅔",
  "0.75": "¾",
  "0.875": "⅞",
};

/**
 * Format a numeric quantity as a readable string with vulgar fractions.
 * e.g. 1.5 → "1 ½", 0.25 → "¼", 3 → "3"
 */
export function formatQty(qty: number | null | undefined): string {
  if (qty == null || qty === 0) return "";
  const whole = Math.floor(qty);
  const frac = Math.round((qty - whole) * 1000) / 1000;

  if (frac === 0) return String(whole);

  // Find closest fraction
  let best = "";
  let bestDiff = Infinity;
  for (const [key, sym] of Object.entries(FRACTIONS)) {
    const diff = Math.abs(frac - parseFloat(key));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = sym;
    }
  }

  // If no close fraction match (> 0.05 off), use decimal
  if (bestDiff > 0.05) {
    return String(Math.round(qty * 100) / 100);
  }

  return whole > 0 ? `${whole} ${best}` : best;
}

/**
 * Parse a quantity string like "1 1/2", "1/4", "2" into a number.
 */
export function parseQty(str: string): number | null {
  if (!str.trim()) return null;
  const s = str.trim();

  // Vulgar fractions
  const vulgar: Record<string, number> = {
    "⅛": 0.125, "¼": 0.25, "⅓": 0.333, "⅜": 0.375,
    "½": 0.5, "⅝": 0.625, "⅔": 0.667, "¾": 0.75, "⅞": 0.875,
  };
  for (const [sym, val] of Object.entries(vulgar)) {
    if (s.includes(sym)) {
      const before = s.replace(sym, "").trim();
      return before ? parseFloat(before) + val : val;
    }
  }

  // "1 1/2" or "1/2"
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    return parseInt(mixed[1]!) + parseInt(mixed[2]!) / parseInt(mixed[3]!);
  }

  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    return parseInt(frac[1]!) / parseInt(frac[2]!);
  }

  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

/**
 * Parse an ingredient string into qty, unit, and item parts.
 * Handles formats like "2 cups flour", "1/2 tsp salt", "3 eggs"
 */
export function parseIngredient(text: string): {
  qty: number | null;
  unit: string;
  item: string;
} {
  const s = text.trim();

  // Match leading quantity (number, fraction, or mixed)
  const qtyPattern = /^([\d½¼¾⅓⅔⅛⅜⅝⅞]+(?:\s*[\d/½¼¾⅓⅔⅛⅜⅝⅞]+)?(?:\/\d+)?)\s*/;
  const qtyMatch = s.match(qtyPattern);

  if (!qtyMatch) {
    return { qty: null, unit: "", item: s };
  }

  const qtyStr = qtyMatch[1]!;
  const qty = parseQty(qtyStr);
  const rest = s.slice(qtyMatch[0].length);

  // Common units
  const unitPattern =
    /^(cups?|tablespoons?|teaspoons?|tbsp|tsp|oz|ounces?|lbs?|pounds?|grams?|g|kg|ml|liters?|quarts?|gallons?|pinch(?:es)?|dash(?:es)?|cloves?|bunch(?:es)?|pieces?|slices?|cans?|packages?|pkg|jars?|heads?|stalks?|sprigs?|handfuls?|sticks?|fl\s*oz)\s+/i;
  const unitMatch = rest.match(unitPattern);

  if (unitMatch) {
    return {
      qty,
      unit: unitMatch[1]!,
      item: rest.slice(unitMatch[0].length),
    };
  }

  return { qty, unit: "", item: rest };
}

/**
 * Scale an ingredient quantity by a multiplier and format it.
 */
export function scaleIngredient(
  text: string,
  multiplier: number,
): string {
  const { qty, unit, item } = parseIngredient(text);
  if (qty == null) return text;

  const scaled = qty * multiplier;
  const formatted = formatQty(scaled);
  return [formatted, unit, item].filter(Boolean).join(" ");
}
