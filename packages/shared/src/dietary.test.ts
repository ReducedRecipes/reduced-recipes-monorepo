import { describe, it, expect } from 'vitest';
import {
  DIETARY_FLAGS,
  DIETARY_LABELS,
  restrictionsToMask,
  maskToRestrictions,
  isValidRestriction,
} from './dietary';

describe('DIETARY_FLAGS', () => {
  it('has 16 restrictions', () => {
    expect(Object.keys(DIETARY_FLAGS)).toHaveLength(16);
  });

  it('each value is a unique power of 2', () => {
    const values = Object.values(DIETARY_FLAGS);
    const unique = new Set(values);
    expect(unique.size).toBe(16);
    for (const v of values) {
      expect(v).toBeGreaterThan(0);
      expect(v & (v - 1)).toBe(0); // power of 2 check
    }
  });

  it('matches spec Section 3.3 bit positions', () => {
    expect(DIETARY_FLAGS.vegetarian).toBe(1);
    expect(DIETARY_FLAGS.vegan).toBe(2);
    expect(DIETARY_FLAGS['gluten-free']).toBe(4);
    expect(DIETARY_FLAGS['dairy-free']).toBe(8);
    expect(DIETARY_FLAGS['nut-free']).toBe(16);
    expect(DIETARY_FLAGS.keto).toBe(32);
    expect(DIETARY_FLAGS.halal).toBe(64);
    expect(DIETARY_FLAGS.kosher).toBe(128);
    expect(DIETARY_FLAGS['low-carb']).toBe(256);
    expect(DIETARY_FLAGS.paleo).toBe(512);
    expect(DIETARY_FLAGS.pescatarian).toBe(1024);
    expect(DIETARY_FLAGS['egg-free']).toBe(2048);
    expect(DIETARY_FLAGS['soy-free']).toBe(4096);
    expect(DIETARY_FLAGS['shellfish-free']).toBe(8192);
    expect(DIETARY_FLAGS['low-sodium']).toBe(16384);
    expect(DIETARY_FLAGS['sugar-free']).toBe(32768);
  });
});

describe('DIETARY_LABELS', () => {
  it('has a label for every flag', () => {
    for (const key of Object.keys(DIETARY_FLAGS)) {
      expect(DIETARY_LABELS).toHaveProperty(key);
      expect(typeof DIETARY_LABELS[key as keyof typeof DIETARY_LABELS]).toBe('string');
    }
  });
});

describe('restrictionsToMask', () => {
  it('returns 0 for empty array', () => {
    expect(restrictionsToMask([])).toBe(0);
  });

  it('converts vegetarian + gluten-free to 5', () => {
    expect(restrictionsToMask(['vegetarian', 'gluten-free'])).toBe(5);
  });

  it('converts single restriction', () => {
    expect(restrictionsToMask(['vegan'])).toBe(2);
  });

  it('ignores invalid restriction names', () => {
    expect(restrictionsToMask(['vegetarian', 'invalid', 'vegan'])).toBe(3);
  });

  it('handles all 16 restrictions combined', () => {
    const all = Object.keys(DIETARY_FLAGS);
    expect(restrictionsToMask(all)).toBe(65535); // 2^16 - 1
  });

  it('is idempotent with duplicate entries', () => {
    expect(restrictionsToMask(['keto', 'keto'])).toBe(32);
  });
});

describe('maskToRestrictions', () => {
  it('returns empty array for 0', () => {
    expect(maskToRestrictions(0)).toEqual([]);
  });

  it('returns vegetarian and gluten-free for mask 5', () => {
    expect(maskToRestrictions(5)).toEqual(['vegetarian', 'gluten-free']);
  });

  it('returns single restriction', () => {
    expect(maskToRestrictions(2)).toEqual(['vegan']);
  });

  it('returns all 16 for mask 65535', () => {
    expect(maskToRestrictions(65535)).toHaveLength(16);
  });

  it('round-trips with restrictionsToMask', () => {
    const input = ['vegan', 'halal', 'low-carb'];
    const mask = restrictionsToMask(input);
    const output = maskToRestrictions(mask);
    expect(output).toEqual(input);
  });
});

describe('isValidRestriction', () => {
  it('returns true for valid restrictions', () => {
    expect(isValidRestriction('vegetarian')).toBe(true);
    expect(isValidRestriction('gluten-free')).toBe(true);
    expect(isValidRestriction('sugar-free')).toBe(true);
  });

  it('returns false for invalid strings', () => {
    expect(isValidRestriction('invalid')).toBe(false);
    expect(isValidRestriction('')).toBe(false);
    expect(isValidRestriction('Vegetarian')).toBe(false); // case-sensitive
  });
});
