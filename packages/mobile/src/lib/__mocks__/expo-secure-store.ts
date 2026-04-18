import { vi } from 'vitest';

const store = new Map<string, string>();

export const setItemAsync = vi.fn((key: string, value: string) => {
  store.set(key, value);
  return Promise.resolve();
});

export const getItemAsync = vi.fn((key: string) =>
  Promise.resolve(store.get(key) ?? null),
);

export const deleteItemAsync = vi.fn((key: string) => {
  store.delete(key);
  return Promise.resolve();
});

export function __resetStore() {
  store.clear();
  setItemAsync.mockClear();
  getItemAsync.mockClear();
  deleteItemAsync.mockClear();
}
