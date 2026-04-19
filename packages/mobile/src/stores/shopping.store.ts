import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../lib/mmkv";
import { categoriseIngredient } from "../lib/categorise";
import type { ShoppingList, ShoppingListItem } from "@rr/shared";
import {
  fetchShoppingLists,
  createShoppingList,
  getShoppingList,
  addShoppingListItem,
  updateShoppingListItem,
  deleteShoppingListItem,
  uncheckAllShoppingListItems,
} from "../lib/api";
import { useShoppingSyncStore } from "./shopping-sync.store";

export interface ShoppingItem {
  id: string;
  text: string;
  category: string;
  checked: boolean;
  recipeId: string | null;
  recipeTitle: string | null;
}

interface ShoppingState {
  /** Local items (offline fallback + cache) */
  items: ShoppingItem[];
  /** Server shopping lists */
  lists: ShoppingList[];
  /** Items from the currently active server list */
  serverItems: ShoppingListItem[];
  /** Currently selected list ID */
  activeListId: string | null;
  /** Whether the store is fetching from server */
  isLoading: boolean;
  /** Whether the device is online */
  isOnline: boolean;

  // Online/offline state
  setOnline: (online: boolean) => void;

  // Server-integrated operations
  fetchLists: () => Promise<void>;
  selectList: (listId: string) => Promise<void>;
  createList: (name: string) => Promise<ShoppingList | null>;

  // CRUD operations (server when online, queued when offline)
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
  uncheckAll: () => void;
}

let counter = 0;
function generateId(): string {
  return `shop_${Date.now()}_${++counter}`;
}

function serverItemToLocal(item: ShoppingListItem): ShoppingItem {
  return {
    id: item.id,
    text: item.original_text,
    category: item.category ?? categoriseIngredient(item.original_text),
    checked: item.checked === 1,
    recipeId: item.recipe_id,
    recipeTitle: null,
  };
}

export const useShoppingStore = create<ShoppingState>()(
  persist(
    (set, get) => ({
      items: [],
      lists: [],
      serverItems: [],
      activeListId: null,
      isLoading: false,
      isOnline: true,

      setOnline: (online) => set({ isOnline: online }),

      fetchLists: async () => {
        if (!get().isOnline) return;
        set({ isLoading: true });
        try {
          const res = await fetchShoppingLists();
          set({ lists: res.items, isLoading: false });
        } catch {
          set({ isLoading: false });
        }
      },

      selectList: async (listId) => {
        set({ activeListId: listId });
        if (!get().isOnline) return;
        set({ isLoading: true });
        try {
          const res = await getShoppingList(listId);
          const localItems = res.items.map(serverItemToLocal);
          set({
            serverItems: res.items,
            items: localItems,
            isLoading: false,
          });
        } catch {
          set({ isLoading: false });
        }
      },

      createList: async (name) => {
        if (!get().isOnline) return null;
        try {
          const list = await createShoppingList({ name });
          set((state) => ({ lists: [...state.lists, list] }));
          return list;
        } catch {
          return null;
        }
      },

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

        const { isOnline, activeListId } = get();
        if (activeListId) {
          if (isOnline) {
            for (const ingredient of ingredients) {
              addShoppingListItem(activeListId, {
                name: ingredient,
                recipe_id: recipeId,
              }).catch(() => {});
            }
          } else {
            for (const ingredient of ingredients) {
              useShoppingSyncStore.getState().enqueue({
                shopping_list_id: activeListId,
                type: "add_item",
                text: ingredient,
              });
            }
          }
        }
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

        const { isOnline, activeListId } = get();
        if (activeListId) {
          if (isOnline) {
            addShoppingListItem(activeListId, { name: text }).catch(() => {});
          } else {
            useShoppingSyncStore.getState().enqueue({
              shopping_list_id: activeListId,
              type: "add_item",
              text,
            });
          }
        }
      },

      toggle: (id) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, checked: !item.checked } : item,
          ),
        }));

        const { isOnline, activeListId, items } = get();
        const item = items.find((i) => i.id === id);
        if (activeListId && item) {
          if (isOnline) {
            updateShoppingListItem(activeListId, id, {
              checked: item.checked,
            }).catch(() => {});
          } else {
            useShoppingSyncStore.getState().enqueue({
              shopping_list_id: activeListId,
              type: "check_item",
              item_id: id,
              checked: item.checked,
            });
          }
        }
      },

      remove: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));

        const { isOnline, activeListId } = get();
        if (activeListId) {
          if (isOnline) {
            deleteShoppingListItem(activeListId, id).catch(() => {});
          } else {
            useShoppingSyncStore.getState().enqueue({
              shopping_list_id: activeListId,
              type: "remove_item",
              item_id: id,
            });
          }
        }
      },

      clearChecked: () => {
        const checkedIds = get().items.filter((i) => i.checked).map((i) => i.id);
        set((state) => ({
          items: state.items.filter((item) => !item.checked),
        }));

        const { isOnline, activeListId } = get();
        if (activeListId) {
          if (isOnline) {
            for (const id of checkedIds) {
              deleteShoppingListItem(activeListId, id).catch(() => {});
            }
          } else {
            for (const id of checkedIds) {
              useShoppingSyncStore.getState().enqueue({
                shopping_list_id: activeListId,
                type: "remove_item",
                item_id: id,
              });
            }
          }
        }
      },

      clearAll: () => {
        const allIds = get().items.map((i) => i.id);
        set({ items: [] });

        const { isOnline, activeListId } = get();
        if (activeListId) {
          if (isOnline) {
            for (const id of allIds) {
              deleteShoppingListItem(activeListId, id).catch(() => {});
            }
          } else {
            for (const id of allIds) {
              useShoppingSyncStore.getState().enqueue({
                shopping_list_id: activeListId,
                type: "remove_item",
                item_id: id,
              });
            }
          }
        }
      },

      uncheckAll: () => {
        set((state) => ({
          items: state.items.map((item) => ({ ...item, checked: false })),
        }));

        const { isOnline, activeListId } = get();
        if (activeListId) {
          if (isOnline) {
            uncheckAllShoppingListItems(activeListId).catch(() => {});
          } else {
            // Queue individual check_item mutations for each checked item
            // since the sync endpoint doesn't have an uncheck_all type
            const checkedItems = get().items.filter((i) => i.checked);
            for (const item of checkedItems) {
              useShoppingSyncStore.getState().enqueue({
                shopping_list_id: activeListId,
                type: "check_item",
                item_id: item.id,
                checked: false,
              });
            }
          }
        }
      },
    }),
    {
      name: "shopping-store",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        items: state.items,
        activeListId: state.activeListId,
        lists: state.lists,
      }),
    },
  ),
);
