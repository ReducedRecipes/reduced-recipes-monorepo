import { vi } from 'vitest';

const store = new Map<string, string>();

export default {
  getItem: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
  setItem: vi.fn((key: string, value: string) => {
    store.set(key, value);
    return Promise.resolve();
  }),
  removeItem: vi.fn((key: string) => {
    store.delete(key);
    return Promise.resolve();
  }),
  clear: vi.fn(() => {
    store.clear();
    return Promise.resolve();
  }),
};
