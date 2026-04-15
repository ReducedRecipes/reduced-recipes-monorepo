import type { RecipeDocument, RecipeSummary } from "@rr/shared";
import { useSQLiteContext } from "expo-sqlite";
import { useSavedStore } from "../stores/saved.store";
import { upsertRecipe, deleteRecipe } from "../db/queries";
import { triggerHaptic } from "../lib/haptics";

export interface UseSavedRecipesReturn {
  isSaved: (id: string) => boolean;
  save: (recipe: RecipeDocument | RecipeSummary) => Promise<void>;
  unsave: (id: string) => Promise<void>;
}

function toDocument(recipe: RecipeDocument | RecipeSummary): RecipeDocument {
  if ("source_url" in recipe) return recipe as RecipeDocument;
  return {
    ...recipe,
    source_url: "",
    author: null,
    prep_time: null,
    ingredients: [],
    instructions: [],
    keywords: [],
    schema_valid: false,
    extracted_at: new Date().toISOString(),
    last_checked: new Date().toISOString(),
  };
}

/**
 * Hook combining the saved recipes store with SQLite operations and haptic feedback.
 * Uses useSQLiteContext() internally for database access.
 */
export function useSavedRecipes(): UseSavedRecipesReturn {
  const db = useSQLiteContext();

  const isSaved = (id: string): boolean => {
    return useSavedStore.getState().isSaved(id);
  };

  const save = async (recipe: RecipeDocument | RecipeSummary): Promise<void> => {
    await upsertRecipe(db, toDocument(recipe));
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
