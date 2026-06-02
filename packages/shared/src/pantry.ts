export interface PantryState {
  have: string[];
  exclude: string[];
}

export interface PantryMatch {
  have: number;
  total: number;
  missing: string[];
}

export interface PantryRecipeResult {
  id: string;
  title: string;
  domain: string;
  image_url: string | null;
  total_time: number | null;
  cook_time: number | null;
  yields: string | null;
  cuisine: string | null;
  category: string | null;
  match: PantryMatch;
}

export function emptyPantryState(): PantryState {
  return { have: [], exclude: [] };
}

export function isPantryState(v: unknown): v is PantryState {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    Array.isArray(o.have) && o.have.every((x) => typeof x === 'string') &&
    Array.isArray(o.exclude) && o.exclude.every((x) => typeof x === 'string')
  );
}
