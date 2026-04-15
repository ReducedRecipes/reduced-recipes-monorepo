import type { RecipeDocument } from "@rr/shared";
import type { SQLiteDatabase } from "expo-sqlite";
import { useSavedStore } from "../stores/saved.store";
import { upsertRecipe, deleteRecipe } from "../db/queries";
import { triggerHaptic } from "../lib/haptics";

export interface UseSavedRecipesOptions {
  db: SQLiteDatabase;
}

export interface UseSavedRecipesReturn {
  isSaved: (id: string) => boolean;
  save: (recipe: RecipeDocument) => Promise<void>;
  unsave: (id: string) => Promise<void>;
}

/**
 * Hook combining the saved recipes store with SQLite operations and haptic feedback.
 */
export function useSavedRecipes({ db }: UseSavedRecipesOptions): UseSavedRecipesReturn {
  const isSaved = (id: string): boolean => {
    return useSavedStore.getState().isSaved(id);
  };

  const save = async (recipe: RecipeDocument): Promise<void> => {
    await upsertRecipe(db, recipe);
    useSavedStore.getState().addId(recipe.id);
    await triggerHaptic("medium");
  };

  const unsave = async (id: string): Promise<void> => {
    await deleteRecipe(db, id);
    useSavedStore.getState().removeId(id);
    await triggerHaptic("light");
  };

  return { isSaved, save, unsave };
}
