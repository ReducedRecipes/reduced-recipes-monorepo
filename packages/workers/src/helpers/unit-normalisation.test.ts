import { describe, it, expect } from 'vitest';
import {
  normaliseUnit,
  convertQuantity,
  UNIT_ALIASES,
  UNIT_CONVERSIONS,
} from './unit-normalisation';

// ── normaliseUnit ───────────────────────────────────────────────────

describe('normaliseUnit', () => {
  it('maps common aliases to canonical form', () => {
    expect(normaliseUnit('teaspoon')).toBe('tsp');
    expect(normaliseUnit('teaspoons')).toBe('tsp');
    expect(normaliseUnit('tablespoon')).toBe('tbsp');
    expect(normaliseUnit('tablespoons')).toBe('tbsp');
    expect(normaliseUnit('cups')).toBe('cup');
    expect(normaliseUnit('ounce')).toBe('oz');
    expect(normaliseUnit('ounces')).toBe('oz');
    expect(normaliseUnit('pound')).toBe('lb');
    expect(normaliseUnit('pounds')).toBe('lb');
    expect(normaliseUnit('gram')).toBe('g');
    expect(normaliseUnit('grams')).toBe('g');
    expect(normaliseUnit('kilogram')).toBe('kg');
    expect(normaliseUnit('kilograms')).toBe('kg');
    expect(normaliseUnit('milliliter')).toBe('ml');
    expect(normaliseUnit('milliliters')).toBe('ml');
    expect(normaliseUnit('millilitre')).toBe('ml');
    expect(normaliseUnit('millilitres')).toBe('ml');
    expect(normaliseUnit('liter')).toBe('l');
    expect(normaliseUnit('liters')).toBe('l');
    expect(normaliseUnit('litre')).toBe('l');
    expect(normaliseUnit('litres')).toBe('l');
    expect(normaliseUnit('pieces')).toBe('piece');
    expect(normaliseUnit('pcs')).toBe('piece');
    expect(normaliseUnit('cloves')).toBe('clove');
    expect(normaliseUnit('bunches')).toBe('bunch');
    expect(normaliseUnit('cans')).toBe('can');
    expect(normaliseUnit('slices')).toBe('slice');
    expect(normaliseUnit('sprigs')).toBe('sprig');
  });

  it('returns canonical unit unchanged', () => {
    expect(normaliseUnit('tsp')).toBe('tsp');
    expect(normaliseUnit('tbsp')).toBe('tbsp');
    expect(normaliseUnit('cup')).toBe('cup');
    expect(normaliseUnit('g')).toBe('g');
    expect(normaliseUnit('ml')).toBe('ml');
  });

  it('is case-insensitive', () => {
    expect(normaliseUnit('TSP')).toBe('tsp');
    expect(normaliseUnit('Cups')).toBe('cup');
    expect(normaliseUnit('OUNCES')).toBe('oz');
  });

  it('trims whitespace', () => {
    expect(normaliseUnit('  tsp  ')).toBe('tsp');
    expect(normaliseUnit(' cups ')).toBe('cup');
  });

  it('returns original (lowercased) for unknown units', () => {
    expect(normaliseUnit('handful')).toBe('handful');
    expect(normaliseUnit('GALLON')).toBe('gallon');
  });

  it('returns empty string for empty input', () => {
    expect(normaliseUnit('')).toBe('');
  });
});

// ── convertQuantity ─────────────────────────────────────────────────

describe('convertQuantity', () => {
  it('converts tsp to tbsp', () => {
    const result = convertQuantity(3, 'tsp', 'tbsp');
    expect(result).toBeCloseTo(1);
  });

  it('converts tbsp to tsp', () => {
    const result = convertQuantity(1, 'tbsp', 'tsp');
    expect(result).toBeCloseTo(3);
  });

  it('converts g to kg', () => {
    const result = convertQuantity(1500, 'g', 'kg');
    expect(result).toBeCloseTo(1.5);
  });

  it('converts kg to g', () => {
    const result = convertQuantity(2.5, 'kg', 'g');
    expect(result).toBeCloseTo(2500);
  });

  it('converts ml to l', () => {
    const result = convertQuantity(750, 'ml', 'l');
    expect(result).toBeCloseTo(0.75);
  });

  it('converts l to ml', () => {
    const result = convertQuantity(1.5, 'l', 'ml');
    expect(result).toBeCloseTo(1500);
  });

  it('converts oz to lb', () => {
    const result = convertQuantity(32, 'oz', 'lb');
    expect(result).toBeCloseTo(2);
  });

  it('converts lb to oz', () => {
    const result = convertQuantity(3, 'lb', 'oz');
    expect(result).toBeCloseTo(48);
  });

  it('converts cup to ml', () => {
    const result = convertQuantity(1, 'cup', 'ml');
    expect(result).toBeCloseTo(236.588);
  });

  it('converts ml to cup', () => {
    const result = convertQuantity(236.588, 'ml', 'cup');
    expect(result).toBeCloseTo(1);
  });

  it('converts tsp to ml', () => {
    const result = convertQuantity(1, 'tsp', 'ml');
    expect(result).toBeCloseTo(4.929);
  });

  it('converts tbsp to ml', () => {
    const result = convertQuantity(1, 'tbsp', 'ml');
    expect(result).toBeCloseTo(14.787);
  });

  it('handles unit aliases in conversion', () => {
    const result = convertQuantity(3, 'teaspoons', 'tablespoon');
    expect(result).toBeCloseTo(1);
  });

  it('returns same quantity for same unit', () => {
    expect(convertQuantity(5, 'cup', 'cup')).toBe(5);
  });

  it('returns null for incompatible units', () => {
    expect(convertQuantity(1, 'g', 'cup')).toBeNull();
    expect(convertQuantity(1, 'lb', 'ml')).toBeNull();
    expect(convertQuantity(1, 'piece', 'g')).toBeNull();
  });
});
