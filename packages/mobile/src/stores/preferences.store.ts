import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../lib/mmkv";

export type Theme = "system" | "light" | "dark";
export type TextSize = "sm" | "md" | "lg" | "xl";

export interface PreferencesState {
  theme: Theme;
  textSize: TextSize;
  defaultServings: number;
  dietaryFilters: string[];

  setTheme: (theme: Theme) => void;
  setTextSize: (size: TextSize) => void;
  setDefaultServings: (servings: number) => void;
  toggleDietary: (filter: string) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      textSize: "md",
      defaultServings: 2,
      dietaryFilters: [],

      setTheme: (theme) => set({ theme }),
      setTextSize: (textSize) => set({ textSize }),
      setDefaultServings: (defaultServings) => set({ defaultServings }),
      toggleDietary: (filter) =>
        set((state) => ({
          dietaryFilters: state.dietaryFilters.includes(filter)
            ? state.dietaryFilters.filter((f) => f !== filter)
            : [...state.dietaryFilters, filter],
        })),
    }),
    {
      name: "preferences",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
