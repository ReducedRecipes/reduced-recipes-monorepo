import { useEffect, useMemo } from "react";
import {
  useShoppingStore,
  ShoppingItem,
} from "../stores/shopping.store";

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

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

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
  };
}
