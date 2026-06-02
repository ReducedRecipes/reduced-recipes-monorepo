import { describe, it, expect, beforeEach } from 'vitest';
import { loadLocalPantry, saveLocalPantry } from './pantry-storage';

describe('pantry-storage', () => {
  beforeEach(() => { localStorage.clear(); });

  it('returns empty state when nothing stored', () => {
    expect(loadLocalPantry()).toEqual({ have: [], exclude: [] });
  });

  it('round-trips a pantry through localStorage', () => {
    saveLocalPantry({ have: ['beef'], exclude: ['mushrooms'] });
    expect(loadLocalPantry()).toEqual({ have: ['beef'], exclude: ['mushrooms'] });
  });

  it('returns empty state on malformed json', () => {
    localStorage.setItem('rr_pantry', '{not json');
    expect(loadLocalPantry()).toEqual({ have: [], exclude: [] });
  });

  it('returns empty state on wrong shape', () => {
    localStorage.setItem('rr_pantry', JSON.stringify({ have: 'beef' }));
    expect(loadLocalPantry()).toEqual({ have: [], exclude: [] });
  });
});
