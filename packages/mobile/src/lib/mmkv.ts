import { MMKV } from "react-native-mmkv";
import type { StateStorage } from "zustand/middleware";

let _mmkv: MMKV | null = null;

function getMMKV(): MMKV {
  if (!_mmkv) {
    try {
      _mmkv = new MMKV({ id: "rr-mobile" });
    } catch {
      // Fallback: MMKV not available (e.g. remote debugger)
      // Return a no-op instance
      return {
        getString: () => undefined,
        set: () => {},
        delete: () => {},
        contains: () => false,
        getAllKeys: () => [],
      } as unknown as MMKV;
    }
  }
  return _mmkv;
}

export const mmkv = new Proxy({} as MMKV, {
  get(_, prop) {
    return (getMMKV() as any)[prop];
  },
});

export const mmkvStorage: StateStorage = {
  getItem(key: string): string | null {
    return getMMKV().getString(key) ?? null;
  },
  setItem(key: string, value: string): void {
    getMMKV().set(key, value);
  },
  removeItem(key: string): void {
    getMMKV().delete(key);
  },
};
