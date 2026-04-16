import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

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
  const [value, setValue] = useState(DEFAULT_FLAGS[flag]);

  useEffect(() => {
    AsyncStorage.getItem(`flag:${flag}`).then((override) => {
      if (override !== null) {
        setValue(override === "true");
      }
    });
  }, [flag]);

  return value;
}
