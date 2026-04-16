import { MMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

export const mmkv = new MMKV({ id: "rr-mobile" });

export const mmkvStorage: StateStorage = {
  getItem(key: string): string | null {
    return mmkv.getString(key) ?? null;
  },
  setItem(key: string, value: string): void {
    mmkv.set(key, value);
  },
  removeItem(key: string): void {
    mmkv.delete(key);
  },
};
