import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

/**
 * In-memory cache that mirrors AsyncStorage for synchronous reads.
 * Writes are flushed to AsyncStorage in the background.
 */
const cache = new Map<string, string>();

/** Hydrate cache from AsyncStorage on startup */
AsyncStorage.getAllKeys()
  .then((keys) => (keys.length > 0 ? AsyncStorage.multiGet(keys) : []))
  .then((pairs) => {
    for (const [key, value] of pairs) {
      if (value != null) cache.set(key, value);
    }
  })
  .catch(() => {
    // Startup hydration failed — cache will be populated on individual reads
  });

/**
 * Synchronous key-value store backed by an in-memory cache with
 * AsyncStorage persistence. Provides the .getString() / .set() /
 * .delete() API expected by screens that interact with raw storage.
 */
export const mmkv = {
  getString(key: string): string | undefined {
    return cache.get(key);
  },
  set(key: string, value: string): void {
    cache.set(key, value);
    AsyncStorage.setItem(key, value);
  },
  delete(key: string): void {
    cache.delete(key);
    AsyncStorage.removeItem(key);
  },
};

export const mmkvStorage: StateStorage = {
  getItem(key: string): string | null {
    return cache.get(key) ?? null;
  },
  setItem(key: string, value: string): void {
    cache.set(key, value);
    AsyncStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    cache.delete(key);
    AsyncStorage.removeItem(key);
  },
};
