import { useCallback } from "react";
import { useSQLiteContext } from "expo-sqlite";
import { useSavedRecipes } from "./useSavedRecipes";
import { api } from "../lib/api";

/**
 * Hook that returns a toggle function for bookmarking recipes.
 * Fetches the full recipe document when saving, triggers haptic feedback via useSavedRecipes.
 */
export function useToggleBookmark() {
  const db = useSQLiteContext();
  const { isSaved, save, unsave } = useSavedRecipes({ db });

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
