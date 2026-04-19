import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Polyfill WebSocketPair for test environment ─────────────────────────
if (typeof (globalThis as Record<string, unknown>).WebSocketPair === 'undefined') {
  (globalThis as Record<string, unknown>).WebSocketPair = class WebSocketPair {
    0: { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; readyState: number };
    1: { send: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn>; readyState: number };
    constructor() {
      this[0] = { send: vi.fn(), close: vi.fn(), readyState: 1 };
      this[1] = { send: vi.fn(), close: vi.fn(), readyState: 1 };
    }
  };
}

// ── Mock shopping-lists route for validateShareToken ────────────────────
vi.mock('../routes/shopping-lists', () => ({
  validateShareToken: vi.fn(),
}));

import { ShoppingListDO } from './ShoppingListDO';
import { validateShareToken } from '../routes/shopping-lists';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeD1Result(results: Record<string, unknown>[] = []) {
  return { results, success: true, meta: {} as D1Meta & Record<string, unknown> } as D1Result;
}

function createMockDB(items: Record<string, unknown>[] = []) {
  return {
    prepare: vi.fn((sql: string) => {
      return {
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(
            sql.includes('SELECT') && items.length > 0 ? items[0] : (sql.includes('shopping_lists') ? { id: 'list-1' } : null),
          ),
          all: vi.fn().mockResolvedValue(makeD1Result(items)),
          run: vi.fn().mockResolvedValue({ success: true, meta: { changes: items.length } }),
        }),
      };
    }),
    batch: vi.fn().mockResolvedValue([]),
  } as unknown as D1Database;
}

function createMockSessionKV(sessions: Record<string, string> = {}) {
  return {
    get: vi.fn(async (key: string) => sessions[key] ?? null),
  } as unknown as KVNamespace;
}

interface MockWebSocket {
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

function createMockWebSocket(): MockWebSocket {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: 1,
  };
}

function createMockCtx(webSockets: MockWebSocket[] = []) {
  return {
    getWebSockets: vi.fn(() => webSockets),
    acceptWebSocket: vi.fn(),
    getTags: vi.fn(() => ['list-1', 'user-1']),
    storage: {
      setAlarm: vi.fn().mockResolvedValue(undefined),
      getAlarm: vi.fn().mockResolvedValue(null),
    },
    waitUntil: vi.fn(),
  };
}

function createDO(overrides: {
  items?: Record<string, unknown>[];
  sessions?: Record<string, string>;
  webSockets?: MockWebSocket[];
} = {}) {
  const items = overrides.items ?? [];
  const sessions = overrides.sessions ?? { 'valid-token': JSON.stringify({ userId: 'user-1' }) };
  const webSockets = overrides.webSockets ?? [];

  const mockDB = createMockDB(items);
  const mockSessionKV = createMockSessionKV(sessions);
  const mockCtx = createMockCtx(webSockets);

  const env = {
    USERS_DB: mockDB,
    SESSION_KV: mockSessionKV,
  };

  const durable = new ShoppingListDO(mockCtx as unknown as DurableObjectState, env as never);
  return { durable, env, mockCtx, mockDB };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ShoppingListDO', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (validateShareToken as ReturnType<typeof vi.fn>).mockResolvedValue(false);
  });

  describe('fetch — WebSocket upgrade', () => {
    it('rejects non-WebSocket requests', async () => {
      const { durable } = createDO();
      const req = new Request('https://example.com/?list_id=list-1');
      const res = await durable.fetch(req);
      expect(res.status).toBe(426);
    });

    it('rejects requests without list_id', async () => {
      const { durable } = createDO();
      const req = new Request('https://example.com/', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(400);
    });

    it('rejects unauthenticated requests', async () => {
      const { durable } = createDO();
      const req = new Request('https://example.com/?list_id=list-1', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(401);
    });

    it('rejects invalid session tokens', async () => {
      const { durable } = createDO();
      const req = new Request('https://example.com/?list_id=list-1', {
        headers: { Upgrade: 'websocket', Authorization: 'Bearer invalid-token' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(401);
    });

    it('rejects invalid share tokens', async () => {
      const { durable } = createDO();
      (validateShareToken as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const req = new Request('https://example.com/?list_id=list-1&share_token=bad', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(401);
    });

    it('accepts valid share tokens and reaches WebSocket upgrade', async () => {
      const { durable, mockCtx } = createDO();
      (validateShareToken as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      const req = new Request('https://example.com/?list_id=list-1&share_token=valid', {
        headers: { Upgrade: 'websocket' },
      });
      // In non-Cloudflare environments, Response(null, { status: 101 }) throws RangeError.
      // Reaching that point means auth passed and WebSocket upgrade was attempted.
      try {
        const res = await durable.fetch(req);
        // In Cloudflare runtime, status 101 is valid
        expect(res.status).toBe(101);
      } catch (e) {
        // In jsdom/node, status 101 is out of range — confirms we got past auth
        expect(e).toBeInstanceOf(RangeError);
        expect(mockCtx.acceptWebSocket).toHaveBeenCalled();
      }
    });

    it('rejects when too many connections', async () => {
      const webSockets = Array.from({ length: 10 }, () => createMockWebSocket());
      const { durable } = createDO({ webSockets });
      const req = new Request('https://example.com/?list_id=list-1', {
        headers: { Upgrade: 'websocket', Authorization: 'Bearer valid-token' },
      });
      const res = await durable.fetch(req);
      expect(res.status).toBe(429);
    });
  });

  describe('webSocketMessage — message handling', () => {
    it('handles add_item and broadcasts item_added', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(sent.type).toBe('item_added');
      expect(sent.item.original_text).toBe('Milk');
      expect(sent.seq).toBe(1);
    });

    it('handles check_item and broadcasts item_checked', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'check_item', item_id: 'item-1', checked: true }),
      );

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(sent.type).toBe('item_checked');
      expect(sent.item_id).toBe('item-1');
      expect(sent.checked).toBe(true);
      expect(sent.seq).toBe(1);
    });

    it('handles remove_item and broadcasts item_removed', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'remove_item', item_id: 'item-1' }),
      );

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(sent.type).toBe('item_removed');
      expect(sent.item_id).toBe('item-1');
      expect(sent.seq).toBe(1);
    });

    it('handles uncheck_all and broadcasts all_unchecked', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'uncheck_all' }),
      );

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(sent.type).toBe('all_unchecked');
      expect(sent.seq).toBe(1);
    });

    it('returns error for invalid JSON', async () => {
      const ws = createMockWebSocket();
      const { durable } = createDO();

      await durable.webSocketMessage(ws as unknown as WebSocket, 'not json');

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(sent.type).toBe('error');
      expect(sent.message).toBe('Invalid JSON');
    });

    it('returns error for unknown message type', async () => {
      const ws = createMockWebSocket();
      const { durable } = createDO();

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'unknown_type' }),
      );

      expect(ws.send).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(ws.send.mock.calls[0]![0] as string);
      expect(sent.type).toBe('error');
    });
  });

  describe('seq numbering', () => {
    it('increments seq monotonically across messages', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Eggs' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'uncheck_all' }),
      );

      const seqs = ws.send.mock.calls.map(
        (call: unknown[]) => JSON.parse(call[0] as string).seq,
      );
      expect(seqs).toEqual([1, 2, 3]);
    });
  });

  describe('reconnection replay', () => {
    it('replays messages after last_seq', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      // Generate some messages
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Eggs' } }),
      );
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'uncheck_all' }),
      );

      // Clear calls to track only replay
      ws.send.mockClear();

      // Reconnect requesting messages after seq 1
      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'reconnect', last_seq: 1 }),
      );

      // Should replay seq 2 and 3
      expect(ws.send).toHaveBeenCalledTimes(2);
      const replayed = ws.send.mock.calls.map(
        (call: unknown[]) => JSON.parse(call[0] as string).seq,
      );
      expect(replayed).toEqual([2, 3]);
    });

    it('replays nothing when fully caught up', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );

      ws.send.mockClear();

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'reconnect', last_seq: 1 }),
      );

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  describe('mutation buffering', () => {
    it('buffers mutations and schedules alarm', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );

      expect(mockCtx.storage.setAlarm).toHaveBeenCalled();
    });

    it('flushes mutation buffer on alarm', async () => {
      const ws = createMockWebSocket();
      const allWs = [ws];
      const { durable, mockCtx, mockDB } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );

      // Trigger alarm
      await durable.alarm();

      expect(mockDB.batch).toHaveBeenCalledTimes(1);
    });

    it('does nothing on alarm with empty buffer', async () => {
      const { durable, mockDB } = createDO();

      await durable.alarm();

      expect(mockDB.batch).not.toHaveBeenCalled();
    });
  });

  describe('broadcast', () => {
    it('sends to all connected WebSockets', async () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      const allWs = [ws1, ws2];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      await durable.webSocketMessage(
        ws1 as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );

      // Both WebSockets should receive the broadcast
      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);
    });

    it('handles send errors gracefully', async () => {
      const ws1 = createMockWebSocket();
      const ws2 = createMockWebSocket();
      ws1.send.mockImplementation(() => { throw new Error('Connection closed'); });
      const allWs = [ws1, ws2];
      const { durable, mockCtx } = createDO({ webSockets: allWs });
      mockCtx.getWebSockets.mockReturnValue(allWs);

      // Should not throw
      await durable.webSocketMessage(
        ws2 as unknown as WebSocket,
        JSON.stringify({ type: 'add_item', item: { text: 'Milk' } }),
      );

      // ws2 should still receive the message
      expect(ws2.send).toHaveBeenCalledTimes(1);
    });
  });
});
