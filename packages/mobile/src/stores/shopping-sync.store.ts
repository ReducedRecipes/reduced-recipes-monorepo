import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../lib/mmkv";
import type { ShoppingListItemSyncAction, ShoppingListItemSyncResult } from "@rr/shared";
import { syncShoppingListItems } from "../lib/api";

interface ShoppingSyncState {
  pendingMutations: ShoppingListItemSyncAction[];
  lastSyncTimestamp: string | null;
  isSyncing: boolean;
  retryCount: number;

  enqueue: (mutation: Omit<ShoppingListItemSyncAction, "client_timestamp">) => void;
  sync: () => Promise<ShoppingListItemSyncResult[]>;
  clearPending: () => void;
}

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;

export const useShoppingSyncStore = create<ShoppingSyncState>()(
  persist(
    (set, get) => ({
      pendingMutations: [],
      lastSyncTimestamp: null,
      isSyncing: false,
      retryCount: 0,

      enqueue: (mutation) => {
        const fullMutation: ShoppingListItemSyncAction = {
          ...mutation,
          client_timestamp: new Date().toISOString(),
        };

        set((state) => ({
          pendingMutations: [...state.pendingMutations, fullMutation],
        }));
      },

      sync: async () => {
        const state = get();
        if (state.isSyncing || state.pendingMutations.length === 0) return [];

        set({ isSyncing: true });

        try {
          // Group mutations by shopping_list_id
          const byList = new Map<string, ShoppingListItemSyncAction[]>();
          for (const m of state.pendingMutations) {
            const existing = byList.get(m.shopping_list_id) ?? [];
            existing.push(m);
            byList.set(m.shopping_list_id, existing);
          }

          const allResults: ShoppingListItemSyncResult[] = [];

          for (const [listId, mutations] of byList) {
            const response = await syncShoppingListItems(listId, mutations);
            allResults.push(...response.results);

            for (const result of response.results) {
              if (result.status === "conflict") {
                console.warn(
                  `[shopping-sync] Conflict for item ${result.item_id}, accepting server state`,
                );
              }
            }
          }

          set({
            isSyncing: false,
            pendingMutations: [],
            retryCount: 0,
            lastSyncTimestamp: new Date().toISOString(),
          });

          return allResults;
        } catch (error) {
          const newRetryCount = get().retryCount + 1;
          set({ isSyncing: false, retryCount: newRetryCount });

          if (newRetryCount < MAX_RETRIES) {
            const delay = BASE_DELAY_MS * Math.pow(2, newRetryCount - 1);
            setTimeout(() => {
              get().sync().catch(() => {});
            }, delay);
          }

          throw error;
        }
      },

      clearPending: () => {
        set({ pendingMutations: [], retryCount: 0 });
      },
    }),
    {
      name: "shopping-sync-store",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        pendingMutations: state.pendingMutations,
        lastSyncTimestamp: state.lastSyncTimestamp,
      }),
    },
  ),
);
