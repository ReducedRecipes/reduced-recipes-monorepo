import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { mmkvStorage } from "../lib/mmkv";
import type { BookmarkSyncAction, BookmarkSyncResult } from "@rr/shared";
import { syncBookmarks } from "../lib/api";
import {
  insertOfflineAction,
  getPendingActions,
  markActionSynced,
  clearSyncedActions,
} from "../db/queries";
import type { SQLiteDatabase } from "expo-sqlite";

interface SyncState {
  pendingActions: BookmarkSyncAction[];
  lastSyncTimestamp: string | null;
  isSyncing: boolean;
  pendingCount: number;

  enqueueAction: (
    db: SQLiteDatabase,
    action: Omit<BookmarkSyncAction, "client_timestamp">,
  ) => Promise<void>;
  sync: (db: SQLiteDatabase) => Promise<BookmarkSyncResult[]>;
  hydrate: (db: SQLiteDatabase) => Promise<void>;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set, get) => ({
      pendingActions: [],
      lastSyncTimestamp: null,
      isSyncing: false,
      pendingCount: 0,

      enqueueAction: async (db, action) => {
        const clientTimestamp = new Date().toISOString();
        const fullAction: BookmarkSyncAction = {
          ...action,
          client_timestamp: clientTimestamp,
        };

        await insertOfflineAction(db, {
          recipe_id: action.recipe_id,
          collection_id: action.collection_id,
          action: action.action,
          client_timestamp: clientTimestamp,
        });

        set((state) => ({
          pendingActions: [...state.pendingActions, fullAction],
          pendingCount: state.pendingCount + 1,
        }));
      },

      sync: async (db) => {
        const state = get();
        if (state.isSyncing || state.pendingActions.length === 0) return [];

        set({ isSyncing: true });

        try {
          const pending = await getPendingActions(db);
          if (pending.length === 0) {
            set({ isSyncing: false, pendingActions: [], pendingCount: 0 });
            return [];
          }

          const actions: BookmarkSyncAction[] = pending.map((p) => ({
            recipe_id: p.recipe_id,
            collection_id: p.collection_id,
            action: p.action,
            client_timestamp: p.client_timestamp,
          }));

          const response = await syncBookmarks(actions);

          for (const p of pending) {
            await markActionSynced(db, p.id);
          }
          await clearSyncedActions(db);

          for (const result of response.results) {
            if (result.status === "conflict") {
              console.warn(
                `[sync] Conflict for recipe ${result.recipe_id}, accepting server state:`,
                result.server_state,
              );
            }
          }

          set({
            isSyncing: false,
            pendingActions: [],
            pendingCount: 0,
            lastSyncTimestamp: new Date().toISOString(),
          });

          return response.results;
        } catch (error) {
          set({ isSyncing: false });
          throw error;
        }
      },

      hydrate: async (db) => {
        const pending = await getPendingActions(db);
        const actions: BookmarkSyncAction[] = pending.map((p) => ({
          recipe_id: p.recipe_id,
          collection_id: p.collection_id,
          action: p.action,
          client_timestamp: p.client_timestamp,
        }));
        set({ pendingActions: actions, pendingCount: actions.length });
      },
    }),
    {
      name: "sync-store",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        lastSyncTimestamp: state.lastSyncTimestamp,
      }),
    },
  ),
);
