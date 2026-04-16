import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

export const mmkv = {
  getString(key: string): string | undefined {
    // Sync wrapper — returns undefined immediately, sets value async
    let result: string | undefined;
    AsyncStorage.getItem(key).then((v) => { result = v ?? undefined; });
    return result;
  },
  set(key: string, value: string): void {
    AsyncStorage.setItem(key, value);
  },
  delete(key: string): void {
    AsyncStorage.removeItem(key);
  },
};

export const mmkvStorage: StateStorage = {
  getItem(key: string): string | null {
    return AsyncStorage.getItem(key) as unknown as string | null;
  },
  setItem(key: string, value: string): void {
    AsyncStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    AsyncStorage.removeItem(key);
  },
};
