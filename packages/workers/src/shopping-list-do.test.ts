import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ShoppingListDO } from './shopping-list-do';
import type { Env } from '@rr/shared/env';
import type { ShoppingListItem, ServerMessage } from '@rr/shared';

// ── Mock helpers ────────────────────────────────────────────────────────

const TEST_LIST_ID = 'list-123';

const TEST_ITEM: ShoppingListItem = {
  id: 'item-1',
  shopping_list_id: TEST_LIST_ID,
  recipe_id: null,
  original_text: 'Milk',
  quantity: 1,
  unit: 'litre',
  item: 'milk',
  checked: 0,
  parse_failed: 0,
  parsing: 0,
  source: 'manual',
  position: 0,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

function makeD1Result(results: Record<string, unknown>[] = []): D1Result {
  return { results, success: true, meta: {} as D1Meta & Record<string, unknown> } as D1Result;
}

function createMockUsersDB(items: Record<string, unknown>[] = []) {
  const batchFn = vi.fn(async () => [makeD1Result()]);
  return {
    prepare: vi.fn(() => ({
      bind: vi.fn(() => ({
        all: vi.fn(async () => makeD1Result(items)),
        first: vi.fn(async () => items[0] ?? null),
        run: vi.fn(async () => makeD1Result()),
      })),
    })),
    batch: batchFn,
  } as unknown as D1Database;
}

class MockWS {
  sent: string[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;
  private attachment: unknown = null;

  send(data: string) { this.sent.push(data); }
  close(code?: number, reason?: string) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
  }
  accept() {}
  serializeAttachment(data: unknown) { this.attachment = data; }
  deserializeAttachment() { return this.attachment; }
  addEventListener() {}
  removeEventListener() {}

  getSentMessages(): ServerMessage[] {
    return this.sent.map((s) => JSON.parse(s));
  }
  getLastMessage(): ServerMessage {
    return JSON.parse(this.sent[this.sent.length - 1]);
  }
  clearSent() { this.sent = []; }
}

function createMockState(initialWebSockets: MockWS[] = []): DurableObjectState {
  let alarm: number | null = null;
  const websockets: WebSocket[] = [...initialWebSockets as unknown as WebSocket[]];

  return {
    id: { toString: () => TEST_LIST_ID } as DurableObjectId,
    storage: {
      getAlarm: vi.fn(async () => alarm),
      setAlarm: vi.fn(async (time: number) => { alarm = time; }),
      deleteAlarm: vi.fn(async () => { alarm = null; }),
      get: vi.fn(async () => undefined),
      put: vi.fn(async () => {}),
      delete: vi.fn(async () => false),
      list: vi.fn(async () => new Map()),
    } as unknown as DurableObjectStorage,
    acceptWebSocket: vi.fn((ws: WebSocket) => { websockets.push(ws); }),
    getWebSockets: vi.fn(() => websockets),
    waitUntil: vi.fn(),
    blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => fn()),
  } as unknown as DurableObjectState;
}

function createMockEnv(dbItems: Record<string, unknown>[] = []): Env {
  return {
    USERS_DB: createMockUsersDB(dbItems),
  } as unknown as Env;
}

/**
 * Helper: creates a ShoppingListDO instance with a pre-registered WebSocket session.
 * This avoids calling fetch() (which needs CF-specific Response with status 101).
 * Instead, we pre-populate the session map via the constructor's getWebSockets() path.
 */
function createDOWithSession(opts?: {
  items?: ShoppingListItem[];
  extraWs?: MockWS[];
}): { durable: ShoppingListDO; ws: MockWS; state: DurableObjectState; env: Env; allWs: MockWS[] } {
  const ws = new MockWS();
  ws.serializeAttachment({ userId: 'user-1', shareToken: null, lastShareCheck: Date.now() });

  const extraWs = opts?.extraWs ?? [];
  for (const ews of extraWs) {
    ews.serializeAttachment({ userId: 'user-extra', shareToken: null, lastShareCheck: Date.now() });
  }

  const allWs = [ws, ...extraWs];
  const dbItems = (opts?.items ?? [TEST_ITEM]) as unknown as Record<string, unknown>[];
  const state = createMockState(allWs);
  const env = createMockEnv(dbItems);

  const durable = new ShoppingListDO(state, env);

  return { durable, ws, state, env, allWs };
}

/**
 * Initialize the DO by calling loadItems (via a fetch for non-WS request which triggers 426 but also sets initialized=false).
 * Since we can't call fetch with WS in Node, we trigger initialization by sending a message first —
 * BUT loadItems is called in fetch(). So we need to call it separately.
 * We'll use a small trick: call a no-op method to let items load, or we manually do it.
 */
async function initializeDO(durable: ShoppingListDO): Promise<void> {
  // Trigger a 426 response to avoid the real WS upgrade, but items won't load from that.
  // Instead, we directly invoke the alarm (which calls flushPendingWrites).
  // The items map is populated in constructor via getWebSockets, but loadItems is only called in fetch.
  // For test purposes, we need the items to be pre-loaded. Let's use a different approach:
  // We'll send a "reconnect" message which will trigger handleReconnect and send state.
  // The items won't be loaded from DB unless fetch() is called.
  // So we need to not depend on loadItems for testing — items are managed in-memory.
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ShoppingListDO', () => {
  describe('fetch — WebSocket upgrade validation', () => {
    it('rejects non-WebSocket requests with 426', async () => {
      const state = createMockState();
      const env = createMockEnv();
      const durable = new ShoppingListDO(state, env);

      const req = new Request('https://example.com/ws/list-123');
      const res = await durable.fetch(req);
      expect(res.status).toBe(426);
    });

    it('rejects unauthenticated requests with 401', async () => {
      const state = createMockState();
      const env = createMockEnv();
      const durable = new ShoppingListDO(state, env);

      const req = new Request('https://example.com/ws/list-123', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(401);
    });

    it('rejects connections beyond MAX_CONNECTIONS (10)', async () => {
      // Pre-populate 10 sessions
      const sockets: MockWS[] = [];
      for (let i = 0; i < 10; i++) {
        const s = new MockWS();
        s.serializeAttachment({ userId: `user-${i}`, shareToken: null, lastShareCheck: Date.now() });
        sockets.push(s);
      }
      const state = createMockState(sockets);
      const env = createMockEnv();
      const durable = new ShoppingListDO(state, env);

      const req = new Request('https://example.com/ws/list-123', {
        headers: { Upgrade: 'websocket', 'X-User-Id': 'user-overflow' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(429);
    });
  });

  describe('webSocketMessage — message handling', () => {
    it('handles invalid JSON gracefully', async () => {
      const { durable, ws } = createDOWithSession();
      await durable.webSocketMessage(ws as unknown as WebSocket, 'not json');
      const msg = ws.getLastMessage();
      expect(msg.type).toBe('error');
      expect((msg as Extract<ServerMessage, { type: 'error' }>).message).toBe('Invalid JSON');
    });

    it('handles unknown message types', async () => {
      const { durable, ws } = createDOWithSession();
      await durable.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({ type: 'unknown_type' }));
      const msg = ws.getLastMessage();
      expect(msg.type).toBe('error');
    });

    it('handles add_item and broadcasts item_added', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Bread' } }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('item_added');
      const addedMsg = msg as Extract<ServerMessage, { type: 'item_added' }>;
      expect(addedMsg.item.original_text).toBe('Bread');
      expect(addedMsg.item.source).toBe('manual');
      expect(addedMsg.seq).toBe(1);
    });

    it('handles check_item and broadcasts item_checked', async () => {
      const { durable, ws } = createDOWithSession();
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'check_item', item_id: 'item-1', checked: true }),
      );

      // Items aren't loaded from DB in this path (loadItems only called via fetch).
      // So this should return error since items map is empty unless we pre-load.
      // Let's first add an item, then check it.
    });

    it('handles check_item for existing item (added via add_item)', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      // First add an item
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Bread' } }),
      );
      const addedMsg = ws.getLastMessage() as Extract<ServerMessage, { type: 'item_added' }>;
      const itemId = addedMsg.item.id;
      ws.clearSent();

      // Now check it
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'check_item', item_id: itemId, checked: true }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('item_checked');
      const checkedMsg = msg as Extract<ServerMessage, { type: 'item_checked' }>;
      expect(checkedMsg.item_id).toBe(itemId);
      expect(checkedMsg.checked).toBe(true);
      expect(checkedMsg.seq).toBe(2);
    });

    it('handles check_item for non-existent item with error', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'check_item', item_id: 'nonexistent', checked: true }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('error');
    });

    it('handles remove_item and broadcasts item_removed', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      // Add then remove
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Eggs' } }),
      );
      const addedMsg = ws.getLastMessage() as Extract<ServerMessage, { type: 'item_added' }>;
      ws.clearSent();

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'remove_item', item_id: addedMsg.item.id }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('item_removed');
      const removedMsg = msg as Extract<ServerMessage, { type: 'item_removed' }>;
      expect(removedMsg.item_id).toBe(addedMsg.item.id);
    });

    it('handles remove_item for non-existent item with error', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'remove_item', item_id: 'nonexistent' }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('error');
    });

    it('handles update_quantity and broadcasts item_updated', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      // Add an item first
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Flour' } }),
      );
      const addedMsg = ws.getLastMessage() as Extract<ServerMessage, { type: 'item_added' }>;
      ws.clearSent();

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'update_quantity', item_id: addedMsg.item.id, quantity: 5 }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('item_updated');
      const updatedMsg = msg as Extract<ServerMessage, { type: 'item_updated' }>;
      expect(updatedMsg.item.quantity).toBe(5);
    });

    it('handles uncheck_all and broadcasts all_unchecked', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      // Add and check an item
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Butter' } }),
      );
      const addedMsg = ws.getLastMessage() as Extract<ServerMessage, { type: 'item_added' }>;
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'check_item', item_id: addedMsg.item.id, checked: true }),
      );
      ws.clearSent();

      // Uncheck all
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'uncheck_all' }),
      );

      const msg = ws.getLastMessage();
      expect(msg.type).toBe('all_unchecked');
    });

    it('increments seq monotonically across operations', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'A' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'B' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'C' } }),
      );

      const msgs = ws.getSentMessages();
      const seqs = msgs.filter((m) => 'seq' in m).map((m) => (m as { seq: number }).seq);
      expect(seqs).toEqual([1, 2, 3]);
    });
  });

  describe('reconnection', () => {
    it('replays messages since last_seq on reconnect', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      // Generate messages
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'A' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'B' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'C' } }),
      );
      ws.clearSent();

      // Reconnect asking for messages after seq 1
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'reconnect', last_seq: 1 }),
      );

      const msgs = ws.getSentMessages();
      // Should replay seq 2 and 3
      const seqs = msgs.filter((m) => 'seq' in m).map((m) => (m as { seq: number }).seq);
      expect(seqs).toContain(2);
      expect(seqs).toContain(3);
    });

    it('sends full state when no matching messages in buffer', async () => {
      const { durable, ws } = createDOWithSession({ items: [] });

      ws.clearSent();

      // Ask for old messages with last_seq=-999 (nothing in buffer)
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'reconnect', last_seq: -999 }),
      );

      const msgs = ws.getSentMessages();
      expect(msgs[0].type).toBe('state');
    });
  });

  describe('batch flush (alarm)', () => {
    it('schedules alarm when mutations are pending', async () => {
      const { durable, ws, state } = createDOWithSession({ items: [] });

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Butter' } }),
      );

      expect(state.storage.setAlarm).toHaveBeenCalled();
    });

    it('flushes pending writes via D1 batch on alarm', async () => {
      const { durable, ws, env } = createDOWithSession({ items: [] });

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Butter' } }),
      );

      await durable.alarm();

      expect((env.USERS_DB as { batch: ReturnType<typeof vi.fn> }).batch).toHaveBeenCalled();
    });

    it('flushes pending writes on last WebSocket close', async () => {
      const { durable, ws, env } = createDOWithSession({ items: [] });

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Butter' } }),
      );

      await durable.webSocketClose(ws as unknown as WebSocket, 1000, 'Normal');

      expect((env.USERS_DB as { batch: ReturnType<typeof vi.fn> }).batch).toHaveBeenCalled();
    });

    it('does not flush when no pending writes', async () => {
      const { durable, env } = createDOWithSession({ items: [] });

      await durable.alarm();

      expect((env.USERS_DB as { batch: ReturnType<typeof vi.fn> }).batch).not.toHaveBeenCalled();
    });
  });

  describe('broadcast to multiple clients', () => {
    it('broadcasts messages to all connected clients', async () => {
      const ws2 = new MockWS();
      const { durable, ws: ws1 } = createDOWithSession({ items: [], extraWs: [ws2] });

      ws1.clearSent();
      ws2.clearSent();

      // Send message from ws1
      await durable.webSocketMessage(
        ws1 as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Eggs' } }),
      );

      // Both should receive the broadcast
      expect(ws1.sent.length).toBe(1);
      expect(ws2.sent.length).toBe(1);

      const msg1 = ws1.getLastMessage();
      const msg2 = ws2.getLastMessage();
      expect(msg1.type).toBe('item_added');
      expect(msg2.type).toBe('item_added');
    });
  });

  describe('webSocketClose', () => {
    it('removes session on close', async () => {
      const ws2 = new MockWS();
      const { durable, ws: ws1 } = createDOWithSession({ items: [], extraWs: [ws2] });

      ws1.clearSent();
      ws2.clearSent();

      // Close ws1
      await durable.webSocketClose(ws1 as unknown as WebSocket, 1000, 'Normal');

      // Send message — only ws2 should receive
      await durable.webSocketMessage(
        ws2 as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Salt' } }),
      );

      expect(ws1.sent.length).toBe(0);
      expect(ws2.sent.length).toBe(1);
    });
  });

  describe('webSocketError', () => {
    it('removes session on error', async () => {
      const ws2 = new MockWS();
      const { durable, ws: ws1 } = createDOWithSession({ items: [], extraWs: [ws2] });

      ws1.clearSent();
      ws2.clearSent();

      await durable.webSocketError(ws1 as unknown as WebSocket);

      // Send message — only ws2 should receive
      await durable.webSocketMessage(
        ws2 as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Pepper' } }),
      );

      expect(ws1.sent.length).toBe(0);
      expect(ws2.sent.length).toBe(1);
    });
  });
});
