import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../lib/mmkv";
import { categoriseIngredient } from "../lib/categorise";

export interface ShoppingItem {
  id: string;
  text: string;
  category: string;
  checked: boolean;
  recipeId: string | null;
  recipeTitle: string | null;
}

interface ShoppingState {
  items: ShoppingItem[];
  addFromRecipe: (
    recipeId: string,
    recipeTitle: string,
    ingredients: string[],
  ) => void;
  addManual: (text: string) => void;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clearChecked: () => void;
  clearAll: () => void;
}

let counter = 0;
function generateId(): string {
  return `shop_${Date.now()}_${++counter}`;
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set) => ({
      items: [],

      addFromRecipe: (recipeId, recipeTitle, ingredients) => {
        const newItems: ShoppingItem[] = ingredients.map((ingredient) => ({
          id: generateId(),
          text: ingredient,
          category: categoriseIngredient(ingredient),
          checked: false,
          recipeId,
          recipeTitle,
        }));
        set((state) => ({ items: [...state.items, ...newItems] }));
      },

      addManual: (text) => {
        const item: ShoppingItem = {
          id: generateId(),
          text,
          category: categoriseIngredient(text),
          checked: false,
          recipeId: null,
          recipeTitle: null,
        };
        set((state) => ({ items: [...state.items, item] }));
      },

      toggle: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item,
          ),
        }));
      },

      remove: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },

      clearChecked: () => {
        set((state) => ({
          items: state.items.filter((item) => !item.checked),
        }));
      },

      clearAll: () => {
        set({ items: [] });
      },
    }),
    {
      name: "shopping-store",
      storage: createJSONStorage(() => mmkvStorage),
    },
  ),
);
