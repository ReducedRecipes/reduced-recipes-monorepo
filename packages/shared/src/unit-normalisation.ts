// ── Unit variant mapping ────────────────────────────────────────────

export const UNIT_VARIANTS: Record<string, string> = {
  // teaspoon
  tsp: 'teaspoon', t: 'teaspoon', teaspoon: 'teaspoon', teaspoons: 'teaspoon',
  // tablespoon
  tbsp: 'tablespoon', tbs: 'tablespoon', T: 'tablespoon', tablespoon: 'tablespoon', tablespoons: 'tablespoon',
  // cup
  cup: 'cup', cups: 'cup', c: 'cup', C: 'cup',
  // quart
  quart: 'quart', quarts: 'quart', qt: 'quart',
  // gallon
  gallon: 'gallon', gallons: 'gallon', gal: 'gallon',
  // fluid_ounce
  'fl oz': 'fluid_ounce', 'fluid ounces': 'fluid_ounce', 'fl. oz.': 'fluid_ounce', fluid_ounce: 'fluid_ounce',
  // milliliter
  ml: 'milliliter', mL: 'milliliter', milliliter: 'milliliter', milliliters: 'milliliter', millilitres: 'milliliter',
  // liter
  l: 'liter', L: 'liter', liter: 'liter', liters: 'liter', litres: 'liter',
  // gram
  g: 'gram', gram: 'gram', grams: 'gram', grammes: 'gram',
  // kilogram
  kg: 'kilogram', kilogram: 'kilogram', kilograms: 'kilogram',
  // ounce
  oz: 'ounce', ounce: 'ounce', ounces: 'ounce',
  // pound
  lb: 'pound', lbs: 'pound', pound: 'pound', pounds: 'pound',
  // pinch
  pinch: 'pinch', pinches: 'pinch',
  // dash
  dash: 'dash', dashes: 'dash',
  // clove
  clove: 'clove', cloves: 'clove',
  // bunch
  bunch: 'bunch', bunches: 'bunch',
  // piece
  piece: 'piece', pieces: 'piece', pcs: 'piece',
  // slice
  slice: 'slice', slices: 'slice',
  // can
  can: 'can', cans: 'can',
  // package
  package: 'package', packages: 'package', pkg: 'package',
  // jar
  jar: 'jar', jars: 'jar',
  // head
  head: 'head', heads: 'head',
  // stalk
  stalk: 'stalk', stalks: 'stalk',
  // sprig
  sprig: 'sprig', sprigs: 'sprig',
  // handful
  handful: 'handful', handfuls: 'handful',
  // stick
  stick: 'stick', sticks: 'stick',
};

// Build a case-insensitive lookup (lowercase keys)
const LOOKUP: Record<string, string> = {};
for (const [variant, canonical] of Object.entries(UNIT_VARIANTS)) {
  LOOKUP[variant.toLowerCase()] = canonical;
}

// ── Normalise a raw unit string ─────────────────────────────────────

export function normaliseUnit(unit: string): string {
  if (!unit) return unit ?? '';
  const key = unit.toLowerCase().trim();
  return LOOKUP[key] ?? key;
}

// ── Conversion systems ──────────────────────────────────────────────

// All conversions expressed relative to the smallest unit in each system.
// Volume (US): base = teaspoon
const VOLUME_TO_TSP: Record<string, number> = {
  teaspoon: 1,
  tablespoon: 3,
  fluid_ounce: 6, // 2 tablespoons = 6 tsp
  cup: 48,         // 16 tbsp = 48 tsp
  quart: 192,      // 4 cups = 192 tsp
  gallon: 768,     // 4 quarts = 768 tsp
};

// Volume (metric): base = milliliter
const METRIC_VOLUME_TO_ML: Record<string, number> = {
  milliliter: 1,
  liter: 1000,
};

// Weight (imperial): base = ounce
const WEIGHT_TO_OZ: Record<string, number> = {
  ounce: 1,
  pound: 16,
};

// Weight (metric): base = gram
const METRIC_WEIGHT_TO_G: Record<string, number> = {
  gram: 1,
  kilogram: 1000,
};

type ConversionSystem = Record<string, number>;
const SYSTEMS: ConversionSystem[] = [
  VOLUME_TO_TSP,
  METRIC_VOLUME_TO_ML,
  WEIGHT_TO_OZ,
  METRIC_WEIGHT_TO_G,
];

function findSystem(canonical: string): ConversionSystem | null {
  for (const sys of SYSTEMS) {
    if (canonical in sys) return sys;
  }
  return null;
}

// ── Convert between compatible units ────────────────────────────────

export function convertUnit(
  qty: number,
  fromUnit: string,
  toUnit: string,
): { quantity: number; unit: string } | null {
  const from = normaliseUnit(fromUnit);
  const to = normaliseUnit(toUnit);

  if (from === to) return { quantity: qty, unit: to };

  const system = findSystem(from);
  if (!system || !(to in system)) return null;

  const baseQty = qty * (system[from] as number);
  const converted = baseQty / (system[to] as number);

  return { quantity: converted, unit: to };
}

// ── Check if two units are convertible ──────────────────────────────

export function areUnitsConvertible(a: string, b: string): boolean {
  const canonA = normaliseUnit(a);
  const canonB = normaliseUnit(b);

  if (canonA === canonB) return true;

  const system = findSystem(canonA);
  return system != null && canonB in system;
}
