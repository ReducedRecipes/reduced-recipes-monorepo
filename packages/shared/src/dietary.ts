/**
 * Dietary restriction bitmask constants and helpers (spec Section 3.3).
 *
 * Each restriction maps to a single bit position (0–15).
 * A recipe's `dietary_bitmask` column stores which restrictions it satisfies.
 */

export const DIETARY_FLAGS = {
  vegetarian: 1 << 0,       // 1
  vegan: 1 << 1,            // 2
  'gluten-free': 1 << 2,    // 4
  'dairy-free': 1 << 3,     // 8
  'nut-free': 1 << 4,       // 16
  keto: 1 << 5,             // 32
  halal: 1 << 6,            // 64
  kosher: 1 << 7,           // 128
  'low-carb': 1 << 8,       // 256
  paleo: 1 << 9,            // 512
  pescatarian: 1 << 10,     // 1024
  'egg-free': 1 << 11,      // 2048
  'soy-free': 1 << 12,      // 4096
  'shellfish-free': 1 << 13, // 8192
  'low-sodium': 1 << 14,    // 16384
  'sugar-free': 1 << 15,    // 32768
} as const;

export type DietaryRestriction = keyof typeof DIETARY_FLAGS;

export const DIETARY_LABELS: Record<DietaryRestriction, string> = {
  vegetarian: 'Vegetarian',
  vegan: 'Vegan',
  'gluten-free': 'Gluten-Free',
  'dairy-free': 'Dairy-Free',
  'nut-free': 'Nut-Free',
  keto: 'Keto',
  halal: 'Halal',
  kosher: 'Kosher',
  'low-carb': 'Low-Carb',
  paleo: 'Paleo',
  pescatarian: 'Pescatarian',
  'egg-free': 'Egg-Free',
  'soy-free': 'Soy-Free',
  'shellfish-free': 'Shellfish-Free',
  'low-sodium': 'Low-Sodium',
  'sugar-free': 'Sugar-Free',
};

const ALL_RESTRICTIONS = Object.keys(DIETARY_FLAGS) as DietaryRestriction[];

/** Convert an array of restriction names to a combined bitmask. */
export function restrictionsToMask(restrictions: string[]): number {
  let mask = 0;
  for (const r of restrictions) {
    const bit = DIETARY_FLAGS[r as DietaryRestriction];
    if (bit !== undefined) {
      mask |= bit;
    }
  }
  return mask;
}

/** Convert a bitmask back to an array of restriction names. */
export function maskToRestrictions(mask: number): string[] {
  const result: string[] = [];
  for (const name of ALL_RESTRICTIONS) {
    if (mask & DIETARY_FLAGS[name]) {
      result.push(name);
    }
  }
  return result;
}

/** Check whether a string is a valid dietary restriction name. */
export function isValidRestriction(name: string): name is DietaryRestriction {
  return name in DIETARY_FLAGS;
}
