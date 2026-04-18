import { useEffect, useRef } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useSyncStore } from "../stores/sync.store";
import type { SQLiteDatabase } from "expo-sqlite";

export interface UseOfflineSyncOptions {
  db: SQLiteDatabase;
}

/**
 * Subscribes to network state changes and syncs pending bookmark
 * actions via POST /sync/bookmarks when connectivity is restored.
 */
export function useOfflineSync({ db }: UseOfflineSyncOptions): void {
  const wasOffline = useRef(false);

  useEffect(() => {
    useSyncStore.getState().hydrate(db);
  }, [db]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const isConnected = state.isConnected ?? false;

      if (!isConnected) {
        wasOffline.current = true;
        return;
      }

      if (wasOffline.current) {
        wasOffline.current = false;

        const { pendingActions, sync } = useSyncStore.getState();
        if (pendingActions.length === 0) return;

        try {
          await sync(db);
        } catch (error) {
          console.warn("[useOfflineSync] Sync failed, will retry on next reconnect:", error);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [db]);
}
