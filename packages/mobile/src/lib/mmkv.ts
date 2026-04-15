import AsyncStorage from "@react-native-async-storage/async-storage";
import type { StateStorage } from "zustand/middleware";

export const mmkvStorage: StateStorage = {
  getItem(key: string): string | null {
    // AsyncStorage is async but zustand persist middleware handles both
    return AsyncStorage.getItem(key) as unknown as string | null;
  },
  setItem(key: string, value: string): void {
    AsyncStorage.setItem(key, value);
  },
  removeItem(key: string): void {
    AsyncStorage.removeItem(key);
  },
};
