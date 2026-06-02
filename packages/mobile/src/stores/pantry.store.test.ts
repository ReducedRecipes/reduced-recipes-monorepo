import { describe, it, expect, beforeEach } from 'vitest';
import { usePantryStore } from './pantry.store';

describe('usePantryStore', () => {
  beforeEach(() => {
    usePantryStore.setState({ have: [], exclude: [], hydrated: false });
  });

  it('starts empty', () => {
    expect(usePantryStore.getState().have).toEqual([]);
    expect(usePantryStore.getState().exclude).toEqual([]);
  });

  it('addHave dedupes and lowercases', () => {
    usePantryStore.getState().addHave('Beef');
    usePantryStore.getState().addHave('beef');
    expect(usePantryStore.getState().have).toEqual(['beef']);
  });

  it('removeHave drops the item', () => {
    usePantryStore.getState().addHave('beef');
    usePantryStore.getState().addHave('potato');
    usePantryStore.getState().removeHave('beef');
    expect(usePantryStore.getState().have).toEqual(['potato']);
  });

  it('replace sets both lists at once', () => {
    usePantryStore.getState().replace({ have: ['carrot'], exclude: ['onion'] });
    expect(usePantryStore.getState().have).toEqual(['carrot']);
    expect(usePantryStore.getState().exclude).toEqual(['onion']);
  });
});
