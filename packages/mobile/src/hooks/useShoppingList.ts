import { useEffect, useMemo } from "react";
import NetInfo from "@react-native-community/netinfo";
import {
  useShoppingStore,
  ShoppingItem,
} from "../stores/shopping.store";
import { useShoppingSyncStore } from "../stores/shopping-sync.store";

export function useShoppingList() {
  const items = useShoppingStore((s) => s.items);
  const lists = useShoppingStore((s) => s.lists);
  const activeListId = useShoppingStore((s) => s.activeListId);
  const isLoading = useShoppingStore((s) => s.isLoading);
  const isOnline = useShoppingStore((s) => s.isOnline);
  const addFromRecipe = useShoppingStore((s) => s.addFromRecipe);
  const addManual = useShoppingStore((s) => s.addManual);
  const toggle = useShoppingStore((s) => s.toggle);
  const remove = useShoppingStore((s) => s.remove);
  const clearChecked = useShoppingStore((s) => s.clearChecked);
  const clearAll = useShoppingStore((s) => s.clearAll);
  const uncheckAll = useShoppingStore((s) => s.uncheckAll);
  const fetchLists = useShoppingStore((s) => s.fetchLists);
  const selectList = useShoppingStore((s) => s.selectList);
  const createList = useShoppingStore((s) => s.createList);
  const setOnline = useShoppingStore((s) => s.setOnline);

  const pendingMutations = useShoppingSyncStore((s) => s.pendingMutations);
  const syncPending = useShoppingSyncStore((s) => s.sync);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  // Listen for connectivity changes: update isOnline and trigger sync on reconnect
  useEffect(() => {
    let wasOffline = false;

    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const isConnected = state.isConnected ?? false;
      setOnline(isConnected);

      if (!isConnected) {
        wasOffline = true;
        return;
      }

      if (wasOffline) {
        wasOffline = false;

        // Sync pending shopping list mutations
        const { pendingMutations: pending, sync } = useShoppingSyncStore.getState();
        if (pending.length > 0) {
          try {
            await sync();
          } catch {
            // Retry handled by the sync store's backoff logic
          }
        }

        // Re-fetch lists to get server state after sync
        fetchLists();
        const currentListId = useShoppingStore.getState().activeListId;
        if (currentListId) {
          selectList(currentListId);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [setOnline, fetchLists, selectList]);

  const groupedByCategory = useMemo(() => {
    const grouped: Record<string, ShoppingItem[]> = {};
    for (const item of items) {
      if (!grouped[item.category]) {
        grouped[item.category] = [];
      }
      grouped[item.category]!.push(item);
    }
    return grouped;
  }, [items]);

  const checkedCount = useMemo(
    () => items.filter((item) => item.checked).length,
    [items],
  );

  const totalCount = items.length;

  const recipeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.recipeId) {
        ids.add(item.recipeId);
      }
    }
    return [...ids];
  }, [items]);

  return {
    items,
    lists,
    activeListId,
    isLoading,
    isOnline,
    addFromRecipe,
    addManual,
    toggle,
    remove,
    clearChecked,
    clearAll,
    uncheckAll,
    fetchLists,
    selectList,
    createList,
    groupedByCategory,
    checkedCount,
    totalCount,
    recipeIds,
    pendingMutationCount: pendingMutations.length,
  };
}
