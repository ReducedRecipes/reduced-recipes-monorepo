import { mmkv } from "./mmkv";

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
  const key = `flag:${flag}`;
  const override = mmkv.getString(key);
  if (override !== undefined) {
    return override === "true";
  }
  return DEFAULT_FLAGS[flag];
}
