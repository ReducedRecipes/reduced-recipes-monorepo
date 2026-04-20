import { useState, useEffect } from "react";

export type Theme = "warm" | "cool" | "mono";

const STORAGE_KEY = "rr_theme";

function applyTheme(theme: Theme) {
  if (theme === "warm") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored === "cool" || stored === "mono" ? stored : "warm";
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (next: Theme) => {
    setThemeState(next);
  };

  return { theme, setTheme };
}
