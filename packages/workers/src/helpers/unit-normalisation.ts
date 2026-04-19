// ── Unit alias mapping ──────────────────────────────────────────────

export const UNIT_ALIASES: Record<string, string> = {
  tsp: 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  cup: 'cup',
  cups: 'cup',
  oz: 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  ml: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  piece: 'piece',
  pieces: 'piece',
  pcs: 'piece',
  clove: 'clove',
  cloves: 'clove',
  bunch: 'bunch',
  bunches: 'bunch',
  pinch: 'pinch',
  dash: 'dash',
  can: 'can',
  cans: 'can',
  slice: 'slice',
  slices: 'slice',
  sprig: 'sprig',
  sprigs: 'sprig',
};

// ── Normalise a raw unit string ─────────────────────────────────────

export function normaliseUnit(raw: string): string {
  if (!raw) return '';
  const key = raw.toLowerCase().trim();
  return UNIT_ALIASES[key] ?? key;
}

// ── Conversion factors ──────────────────────────────────────────────

export const UNIT_CONVERSIONS: Record<string, Record<string, number>> = {
  tsp: { tbsp: 1 / 3, ml: 4.929 },
  tbsp: { tsp: 3, ml: 14.787 },
  g: { kg: 1 / 1000 },
  kg: { g: 1000 },
  ml: { l: 1 / 1000, cup: 1 / 236.588 },
  l: { ml: 1000 },
  oz: { lb: 1 / 16 },
  lb: { oz: 16 },
  cup: { ml: 236.588 },
};

// ── Convert between compatible units ────────────────────────────────

export function convertQuantity(
  qty: number,
  fromUnit: string,
  toUnit: string,
): number | null {
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);

  if (from === to) return qty;

  const factor = UNIT_CONVERSIONS[from]?.[to];
  if (factor == null) return null;

  return qty * factor;
}
