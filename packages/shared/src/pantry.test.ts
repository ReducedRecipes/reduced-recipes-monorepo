import { describe, it, expect } from 'vitest';
import {
  emptyPantryState,
  isPantryState,
  type PantryState,
  type PantryRecipeResult,
} from './pantry';

describe('pantry types', () => {
  it('emptyPantryState returns have:[] exclude:[]', () => {
    expect(emptyPantryState()).toEqual({ have: [], exclude: [] });
  });

  it('isPantryState rejects null and bad shapes', () => {
    expect(isPantryState(null)).toBe(false);
    expect(isPantryState({ have: 'beef' })).toBe(false);
    expect(isPantryState({ have: ['beef'], exclude: [1] })).toBe(false);
  });

  it('isPantryState accepts valid shape', () => {
    const v: PantryState = { have: ['beef'], exclude: ['mushrooms'] };
    expect(isPantryState(v)).toBe(true);
  });

  it('PantryRecipeResult has expected match shape', () => {
    const r: PantryRecipeResult = {
      id: 'r1', title: 't', domain: 'd', image_url: null,
      total_time: null, cook_time: null, yields: null,
      cuisine: null, category: null,
      match: { have: 2, total: 3, missing: ['salt'] },
    };
    expect(r.match.missing).toEqual(['salt']);
  });
});
