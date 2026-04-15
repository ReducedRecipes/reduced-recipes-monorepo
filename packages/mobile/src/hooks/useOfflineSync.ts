import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useSavedStore } from "../stores/saved.store";
import { api } from "../lib/api";
import { upsertRecipe } from "../db/queries";
import type { SQLiteDatabase } from "expo-sqlite";

export interface UseOfflineSyncOptions {
  db: SQLiteDatabase;
}

/**
 * Subscribes to network state changes and re-syncs saved recipes
 * from the API when connectivity is restored.
 */
export function useOfflineSync({ db }: UseOfflineSyncOptions): void {
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const isConnected = state.isConnected ?? false;

      if (!isConnected) {
        wasOffline.current = true;
        return;
      }

      if (wasOffline.current) {
        wasOffline.current = false;

        const ids = Array.from(useSavedStore.getState().ids);
        if (ids.length === 0) return;

        const results = await Promise.allSettled(
          ids.map((id) => api.recipes.get(id)),
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            await upsertRecipe(db, result.value);
          }
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [db]);
}
