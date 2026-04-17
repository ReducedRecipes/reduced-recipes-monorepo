import { MMKV } from "react-native-mmkv";

const flagStorage = new MMKV({ id: "rr-flags" });

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
  const override = flagStorage.getString(`flag:${flag}`);
  if (override !== undefined) {
    return override === "true";
  }
  return DEFAULT_FLAGS[flag];
}
