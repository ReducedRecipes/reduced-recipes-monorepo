import { useMemo } from "react";
import { usePreferencesStore, TextSize } from "../stores/preferences.store";

const TEXT_SIZE_MULTIPLIERS: Record<TextSize, number> = {
  sm: 0.85,
  md: 1.0,
  lg: 1.15,
  xl: 1.3,
};

export function usePreferences() {
  const theme = usePreferencesStore((s) => s.theme);
  const textSize = usePreferencesStore((s) => s.textSize);
  const defaultServings = usePreferencesStore((s) => s.defaultServings);
  const dietaryFilters = usePreferencesStore((s) => s.dietaryFilters);
  const setTheme = usePreferencesStore((s) => s.setTheme);
  const setTextSize = usePreferencesStore((s) => s.setTextSize);
  const setDefaultServings = usePreferencesStore((s) => s.setDefaultServings);
  const toggleDietary = usePreferencesStore((s) => s.toggleDietary);

  const textSizeMultiplier = useMemo(
    () => TEXT_SIZE_MULTIPLIERS[textSize],
    [textSize],
  );

  return {
    theme,
    textSize,
    defaultServings,
    dietaryFilters,
    setTheme,
    setTextSize,
    setDefaultServings,
    toggleDietary,
    textSizeMultiplier,
  };
}
