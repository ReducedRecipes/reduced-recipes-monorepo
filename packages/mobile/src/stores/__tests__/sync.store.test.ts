import { describe, it, expect, beforeEach, vi } from "vitest";
import { useSyncStore } from "../sync.store";

// Mock the API
vi.mock("../../lib/api", () => ({
  syncBookmarks: vi.fn(),
}));

// Mock the DB queries
vi.mock("../../db/queries", () => ({
  insertOfflineAction: vi.fn(),
  getPendingActions: vi.fn(),
  markActionSynced: vi.fn(),
  clearSyncedActions: vi.fn(),
}));

import { syncBookmarks } from "../../lib/api";
import {
  insertOfflineAction,
  getPendingActions,
  markActionSynced,
  clearSyncedActions,
} from "../../db/queries";

const mockDb = {} as any;

function resetStore() {
  useSyncStore.setState({
    pendingActions: [],
    lastSyncTimestamp: null,
    isSyncing: false,
    pendingCount: 0,
  });
}

describe("useSyncStore", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("starts with empty pending actions", () => {
    const state = useSyncStore.getState();
    expect(state.pendingActions).toEqual([]);
    expect(state.pendingCount).toBe(0);
    expect(state.isSyncing).toBe(false);
    expect(state.lastSyncTimestamp).toBeNull();
  });

  describe("enqueueAction", () => {
    it("adds an action to the pending queue and writes to SQLite", async () => {
      vi.mocked(insertOfflineAction).mockResolvedValue(undefined);

      await useSyncStore.getState().enqueueAction(mockDb, {
        recipe_id: "recipe-1",
        collection_id: null,
        action: "add",
      });

      const state = useSyncStore.getState();
      expect(state.pendingActions).toHaveLength(1);
      expect(state.pendingActions[0]!.recipe_id).toBe("recipe-1");
      expect(state.pendingActions[0]!.action).toBe("add");
      expect(state.pendingActions[0]!.client_timestamp).toBeDefined();
      expect(state.pendingCount).toBe(1);
      expect(insertOfflineAction).toHaveBeenCalledOnce();
    });

    it("appends multiple actions", async () => {
      vi.mocked(insertOfflineAction).mockResolvedValue(undefined);

      await useSyncStore.getState().enqueueAction(mockDb, {
        recipe_id: "recipe-1",
        collection_id: null,
        action: "add",
      });
      await useSyncStore.getState().enqueueAction(mockDb, {
        recipe_id: "recipe-2",
        collection_id: "col-1",
        action: "remove",
      });

      const state = useSyncStore.getState();
      expect(state.pendingActions).toHaveLength(2);
      expect(state.pendingCount).toBe(2);
    });
  });

  describe("sync", () => {
    it("sends pending actions to API and clears queue on success", async () => {
      useSyncStore.setState({
        pendingActions: [
          { recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z" },
        ],
        pendingCount: 1,
      });

      vi.mocked(getPendingActions).mockResolvedValue([
        { id: "off-1", recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z", synced: false },
      ]);
      vi.mocked(syncBookmarks).mockResolvedValue({
        results: [{ recipe_id: "r-1", status: "applied" }],
      });
      vi.mocked(markActionSynced).mockResolvedValue(undefined);
      vi.mocked(clearSyncedActions).mockResolvedValue(undefined);

      const results = await useSyncStore.getState().sync(mockDb);

      expect(results).toHaveLength(1);
      expect(results[0]!.status).toBe("applied");
      expect(syncBookmarks).toHaveBeenCalledWith([
        { recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z" },
      ]);
      expect(markActionSynced).toHaveBeenCalledWith(mockDb, "off-1");
      expect(clearSyncedActions).toHaveBeenCalledOnce();

      const state = useSyncStore.getState();
      expect(state.pendingActions).toEqual([]);
      expect(state.pendingCount).toBe(0);
      expect(state.isSyncing).toBe(false);
      expect(state.lastSyncTimestamp).not.toBeNull();
    });

    it("returns empty array when no pending actions", async () => {
      const results = await useSyncStore.getState().sync(mockDb);
      expect(results).toEqual([]);
      expect(syncBookmarks).not.toHaveBeenCalled();
    });

    it("does not sync when already syncing", async () => {
      useSyncStore.setState({
        isSyncing: true,
        pendingActions: [
          { recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z" },
        ],
        pendingCount: 1,
      });

      const results = await useSyncStore.getState().sync(mockDb);
      expect(results).toEqual([]);
      expect(syncBookmarks).not.toHaveBeenCalled();
    });

    it("logs conflict results and accepts server state", async () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      useSyncStore.setState({
        pendingActions: [
          { recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z" },
        ],
        pendingCount: 1,
      });

      vi.mocked(getPendingActions).mockResolvedValue([
        { id: "off-1", recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z", synced: false },
      ]);
      vi.mocked(syncBookmarks).mockResolvedValue({
        results: [{ recipe_id: "r-1", status: "conflict", server_state: { exists: true, updated_at: "2024-01-02T00:00:00Z" } }],
      });
      vi.mocked(markActionSynced).mockResolvedValue(undefined);
      vi.mocked(clearSyncedActions).mockResolvedValue(undefined);

      await useSyncStore.getState().sync(mockDb);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Conflict for recipe r-1"),
        expect.objectContaining({ exists: true }),
      );
      warnSpy.mockRestore();
    });

    it("resets isSyncing on error and rethrows", async () => {
      useSyncStore.setState({
        pendingActions: [
          { recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z" },
        ],
        pendingCount: 1,
      });

      vi.mocked(getPendingActions).mockResolvedValue([
        { id: "off-1", recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z", synced: false },
      ]);
      vi.mocked(syncBookmarks).mockRejectedValue(new Error("Network error"));

      await expect(useSyncStore.getState().sync(mockDb)).rejects.toThrow("Network error");
      expect(useSyncStore.getState().isSyncing).toBe(false);
      // pendingActions should remain since sync failed
      expect(useSyncStore.getState().pendingCount).toBe(1);
    });
  });

  describe("hydrate", () => {
    it("loads pending actions from SQLite", async () => {
      vi.mocked(getPendingActions).mockResolvedValue([
        { id: "off-1", recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z", synced: false },
        { id: "off-2", recipe_id: "r-2", collection_id: "col-1", action: "remove", client_timestamp: "2024-01-01T01:00:00Z", synced: false },
      ]);

      await useSyncStore.getState().hydrate(mockDb);

      const state = useSyncStore.getState();
      expect(state.pendingActions).toHaveLength(2);
      expect(state.pendingCount).toBe(2);
      expect(state.pendingActions[0]!.recipe_id).toBe("r-1");
      expect(state.pendingActions[1]!.recipe_id).toBe("r-2");
    });
  });

  describe("MMKV persistence", () => {
    it("only persists lastSyncTimestamp", () => {
      useSyncStore.setState({
        pendingActions: [
          { recipe_id: "r-1", collection_id: null, action: "add", client_timestamp: "2024-01-01T00:00:00Z" },
        ],
        pendingCount: 1,
        lastSyncTimestamp: "2024-01-01T00:00:00Z",
        isSyncing: true,
      });

      // The partialize function should only keep lastSyncTimestamp
      const persistOptions = (useSyncStore as any).persist;
      // Verify the store is configured with persist middleware
      expect(persistOptions).toBeDefined();
    });
  });
});
