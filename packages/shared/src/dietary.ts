/** Dietary restriction bitmask flags — bit positions 0-15 per spec Section 3.3. */
export const DIETARY_FLAGS: Record<string, number> = {
  vegetarian: 1 << 0, // 1
  vegan: 1 << 1, // 2
  "gluten-free": 1 << 2, // 4
  "dairy-free": 1 << 3, // 8
  "nut-free": 1 << 4, // 16
  keto: 1 << 5, // 32
  halal: 1 << 6, // 64
  kosher: 1 << 7, // 128
  "low-carb": 1 << 8, // 256
  paleo: 1 << 9, // 512
  pescatarian: 1 << 10, // 1024
  "egg-free": 1 << 11, // 2048
  "soy-free": 1 << 12, // 4096
  "shellfish-free": 1 << 13, // 8192
  "low-sodium": 1 << 14, // 16384
  "sugar-free": 1 << 15, // 32768
};

/** Human-readable labels for each dietary restriction. */
export const DIETARY_LABELS: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-Free",
  "dairy-free": "Dairy-Free",
  "nut-free": "Nut-Free",
  keto: "Keto",
  halal: "Halal",
  kosher: "Kosher",
  "low-carb": "Low-Carb",
  paleo: "Paleo",
  pescatarian: "Pescatarian",
  "egg-free": "Egg-Free",
  "soy-free": "Soy-Free",
  "shellfish-free": "Shellfish-Free",
  "low-sodium": "Low-Sodium",
  "sugar-free": "Sugar-Free",
};

/** Convert an array of restriction names to a combined bitmask. */
export function restrictionsToMask(restrictions: string[]): number {
  let mask = 0;
  for (const r of restrictions) {
    const flag = DIETARY_FLAGS[r];
    if (flag !== undefined) {
      mask |= flag;
    }
  }
  return mask;
}

/** Convert a bitmask to an array of restriction names. */
export function maskToRestrictions(mask: number): string[] {
  const restrictions: string[] = [];
  for (const [name, flag] of Object.entries(DIETARY_FLAGS)) {
    if ((mask & flag) === flag) {
      restrictions.push(name);
    }
  }
  return restrictions;
}

/** Check if a restriction name is valid. */
export function isValidRestriction(name: string): boolean {
  return name in DIETARY_FLAGS;
}
