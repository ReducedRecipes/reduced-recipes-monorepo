import { useCallback } from "react";
import { useSavedRecipes } from "./useSavedRecipes";
import { api } from "../lib/api";

let db: any = null;
try {
  const { useSQLiteContext } = require("expo-sqlite");
  // Will only work if SQLiteProvider is in the tree
  db = null; // defer to runtime
} catch {}

/**
 * Hook that returns a toggle function for bookmarking recipes.
 * Fetches the full recipe document when saving, triggers haptic feedback via useSavedRecipes.
 */
export function useToggleBookmark() {
  const { isSaved, save, unsave } = useSavedRecipes();

  const toggleBookmark = useCallback(
    async (id: string) => {
      if (isSaved(id)) {
        await unsave(id);
      } else {
        const recipe = await api.recipes.get(id);
        await save(recipe);
      }
    },
    [isSaved, save, unsave],
  );

  return { toggleBookmark, isSaved };
}
