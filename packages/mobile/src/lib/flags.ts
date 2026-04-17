import { MMKV } from "react-native-mmkv";

let _flagStorage: MMKV | null = null;
function getFlagStorage(): MMKV {
  if (!_flagStorage) {
    try {
      _flagStorage = new MMKV({ id: "rr-flags" });
    } catch {
      return { getString: () => undefined, set: () => {}, delete: () => {} } as unknown as MMKV;
    }
  }
  return _flagStorage;
}

export const DEFAULT_FLAGS = {
  voiceGuidance: true,
  shoppingList: true,
  mealPlanning: false,
  householdShare: false,
  offlineSync: true,
  pushNotifications: true,
} as const;

export type Flag = keyof typeof DEFAULT_FLAGS;

export function useFlag(flag: Flag): boolean {
  const override = getFlagStorage().getString(`flag:${flag}`);
  if (override !== undefined) {
    return override === "true";
  }
  return DEFAULT_FLAGS[flag];
}
