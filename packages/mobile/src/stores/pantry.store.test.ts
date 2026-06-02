import { describe, it, expect, beforeEach } from 'vitest';
import { MMKV } from 'react-native-mmkv';
import { usePantryStore } from './pantry.store';

describe('usePantryStore', () => {
  beforeEach(() => {
    new MMKV().clearAll();
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

  it('addExclude dedupes and lowercases', () => {
    usePantryStore.getState().addExclude('Mushrooms');
    usePantryStore.getState().addExclude('mushrooms');
    expect(usePantryStore.getState().exclude).toEqual(['mushrooms']);
  });

  it('removeExclude drops the item', () => {
    usePantryStore.getState().addExclude('mushrooms');
    usePantryStore.getState().addExclude('onion');
    usePantryStore.getState().removeExclude('mushrooms');
    expect(usePantryStore.getState().exclude).toEqual(['onion']);
  });

  it('replace sets both lists at once', () => {
    usePantryStore.getState().replace({ have: ['carrot'], exclude: ['onion'] });
    expect(usePantryStore.getState().have).toEqual(['carrot']);
    expect(usePantryStore.getState().exclude).toEqual(['onion']);
  });
});
