import { describe, it, expect } from 'vitest';
import { normaliseUnit, convertUnit, areUnitsConvertible } from './unit-normalisation';

// ── normaliseUnit ───────────────────────────────────────────────────

describe('normaliseUnit', () => {
  it('maps all 26 canonical units with at least one variant', () => {
    expect(normaliseUnit('tsp')).toBe('teaspoon');
    expect(normaliseUnit('tbsp')).toBe('tablespoon');
    expect(normaliseUnit('cups')).toBe('cup');
    expect(normaliseUnit('qt')).toBe('quart');
    expect(normaliseUnit('gal')).toBe('gallon');
    expect(normaliseUnit('fl oz')).toBe('fluid_ounce');
    expect(normaliseUnit('mL')).toBe('milliliter');
    expect(normaliseUnit('L')).toBe('liter');
    expect(normaliseUnit('grams')).toBe('gram');
    expect(normaliseUnit('kg')).toBe('kilogram');
    expect(normaliseUnit('oz')).toBe('ounce');
    expect(normaliseUnit('lbs')).toBe('pound');
    expect(normaliseUnit('pinches')).toBe('pinch');
    expect(normaliseUnit('dashes')).toBe('dash');
    expect(normaliseUnit('cloves')).toBe('clove');
    expect(normaliseUnit('bunches')).toBe('bunch');
    expect(normaliseUnit('pcs')).toBe('piece');
    expect(normaliseUnit('slices')).toBe('slice');
    expect(normaliseUnit('cans')).toBe('can');
    expect(normaliseUnit('pkg')).toBe('package');
    expect(normaliseUnit('jars')).toBe('jar');
    expect(normaliseUnit('heads')).toBe('head');
    expect(normaliseUnit('stalks')).toBe('stalk');
    expect(normaliseUnit('sprigs')).toBe('sprig');
    expect(normaliseUnit('handfuls')).toBe('handful');
    expect(normaliseUnit('sticks')).toBe('stick');
  });

  it('returns canonical unit unchanged', () => {
    expect(normaliseUnit('teaspoon')).toBe('teaspoon');
    expect(normaliseUnit('cup')).toBe('cup');
    expect(normaliseUnit('gram')).toBe('gram');
  });

  it('is case-insensitive', () => {
    expect(normaliseUnit('TSP')).toBe('teaspoon');
    expect(normaliseUnit('Cups')).toBe('cup');
    expect(normaliseUnit('OUNCES')).toBe('ounce');
  });

  it('trims whitespace', () => {
    expect(normaliseUnit('  tsp  ')).toBe('teaspoon');
    expect(normaliseUnit(' cups ')).toBe('cup');
  });

  it('returns original lowercased for unknown units', () => {
    expect(normaliseUnit('widget')).toBe('widget');
    expect(normaliseUnit('FOOBAR')).toBe('foobar');
  });

  it('handles edge cases', () => {
    expect(normaliseUnit('')).toBe('');
    expect(normaliseUnit(null as unknown as string)).toBe('');
    expect(normaliseUnit(undefined as unknown as string)).toBe('');
  });
});

// ── convertUnit ─────────────────────────────────────────────────────

describe('convertUnit', () => {
  it('converts 3 tsp = 1 tbsp', () => {
    const result = convertUnit(3, 'tsp', 'tbsp');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
    expect(result!.unit).toBe('tablespoon');
  });

  it('converts 16 tbsp = 1 cup', () => {
    const result = convertUnit(16, 'tbsp', 'cup');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('converts 4 cups = 1 quart', () => {
    const result = convertUnit(4, 'cups', 'quart');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('converts 4 quarts = 1 gallon', () => {
    const result = convertUnit(4, 'quart', 'gallon');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('converts fluid_ounce = 2 tablespoons', () => {
    const result = convertUnit(1, 'fluid_ounce', 'tablespoon');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(2);
  });

  it('converts 16 oz = 1 lb', () => {
    const result = convertUnit(16, 'oz', 'lb');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('converts 1000 ml = 1 L', () => {
    const result = convertUnit(1000, 'ml', 'liter');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('converts 1000 g = 1 kg', () => {
    const result = convertUnit(1000, 'g', 'kg');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('returns same quantity for same unit', () => {
    const result = convertUnit(5, 'cup', 'cup');
    expect(result).toEqual({ quantity: 5, unit: 'cup' });
  });

  it('handles unit aliases in from/to', () => {
    const result = convertUnit(3, 'teaspoons', 'tablespoons');
    expect(result).not.toBeNull();
    expect(result!.quantity).toBeCloseTo(1);
  });

  it('returns null for cross-system conversions', () => {
    expect(convertUnit(1, 'cup', 'gram')).toBeNull();
    expect(convertUnit(1, 'lb', 'ml')).toBeNull();
    expect(convertUnit(1, 'piece', 'gram')).toBeNull();
    expect(convertUnit(1, 'teaspoon', 'liter')).toBeNull();
  });
});

// ── areUnitsConvertible ─────────────────────────────────────────────

describe('areUnitsConvertible', () => {
  it('returns true for same-system units', () => {
    expect(areUnitsConvertible('tsp', 'tbsp')).toBe(true);
    expect(areUnitsConvertible('cup', 'gallon')).toBe(true);
    expect(areUnitsConvertible('oz', 'lb')).toBe(true);
    expect(areUnitsConvertible('g', 'kg')).toBe(true);
    expect(areUnitsConvertible('ml', 'liter')).toBe(true);
  });

  it('returns true for same unit', () => {
    expect(areUnitsConvertible('cup', 'cup')).toBe(true);
  });

  it('returns false for cross-system units', () => {
    expect(areUnitsConvertible('cup', 'gram')).toBe(false);
    expect(areUnitsConvertible('lb', 'liter')).toBe(false);
    expect(areUnitsConvertible('teaspoon', 'milliliter')).toBe(false);
  });

  it('returns false for non-convertible units', () => {
    expect(areUnitsConvertible('piece', 'slice')).toBe(false);
    expect(areUnitsConvertible('bunch', 'can')).toBe(false);
  });
});
