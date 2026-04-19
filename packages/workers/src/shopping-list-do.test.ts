import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import type { Env } from '@rr/shared/env';
import type { ShoppingListItem } from '@rr/shared';

// ── Cloudflare Globals Polyfill ─────────────────────────────────────────

class MockWebSocket {
  sentMessages: string[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.closeCode = code ?? 0;
    this.closeReason = reason ?? '';
  }

  addEventListener() {}
  removeEventListener() {}
}

// Track WebSocket pairs created
let lastClientWs: MockWebSocket;
let lastServerWs: MockWebSocket;

// Patch Response to support status 101 and webSocket property (Cloudflare-specific)
const OriginalResponse = globalThis.Response;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CFResponse = class extends OriginalResponse {
  constructor(body: BodyInit | null | undefined, init?: Record<string, unknown>) {
    const status = (init?.status as number | undefined) ?? 200;
    const adjustedInit = { ...init, status: status === 101 ? 200 : status };
    super(body, adjustedInit as ResponseInit);
    if (status === 101) {
      Object.defineProperty(this, 'status', { value: 101, writable: false });
    }
    if (init?.webSocket) {
      Object.defineProperty(this, 'webSocket', { value: init.webSocket, writable: false });
    }
  }
} as unknown as typeof Response;

beforeAll(() => {
  // Mock WebSocketPair
  (globalThis as unknown as Record<string, unknown>).WebSocketPair = class {
    0: MockWebSocket;
    1: MockWebSocket;
    constructor() {
      lastClientWs = new MockWebSocket();
      lastServerWs = new MockWebSocket();
      this[0] = lastClientWs;
      this[1] = lastServerWs;
    }
  };

  // Replace Response globally
  (globalThis as unknown as Record<string, unknown>).Response = CFResponse;
});

// Import after globals are set up
import { ShoppingListDO } from './shopping-list-do';

// ── Mock Helpers ────────────────────────────────────────────────────────

function makeItem(overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    shopping_list_id: 'list-1',
    recipe_id: null,
    original_text: 'test item',
    quantity: null,
    unit: null,
    item: 'test item',
    checked: 0,
    parse_failed: 0,
    parsing: 0,
    source: 'manual',
    position: 0,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeD1Result(results: Record<string, unknown>[] = []) {
  return { results, success: true, meta: {} };
}

function createMockDB(items: ShoppingListItem[] = []) {
  const batchFn = vi.fn().mockResolvedValue([]);
  return {
    prepare: vi.fn((sql: string) => {
      if (sql.includes('SELECT * FROM shopping_list_items')) {
        return {
          bind: vi.fn().mockReturnThis(),
          all: vi.fn().mockResolvedValue(makeD1Result(items as unknown as Record<string, unknown>[])),
        };
      }
      if (sql.includes('SELECT 1 FROM shopping_lists')) {
        return {
          bind: vi.fn().mockReturnThis(),
          first: vi.fn().mockResolvedValue({ 1: 1 }),
        };
      }
      return {
        bind: vi.fn().mockReturnThis(),
        run: vi.fn().mockResolvedValue({ success: true }),
      };
    }),
    batch: batchFn,
  } as unknown as D1Database;
}

function createMockEnv(items: ShoppingListItem[] = []): Env {
  return {
    USERS_DB: createMockDB(items),
  } as unknown as Env;
}

function createMockState() {
  const websockets: MockWebSocket[] = [];
  let alarm: number | null = null;

  return {
    id: { toString: () => 'test-do-id' },
    storage: {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      getAlarm: vi.fn(async () => alarm),
      setAlarm: vi.fn(async (time: number) => { alarm = time; }),
      deleteAlarm: vi.fn(async () => { alarm = null; }),
    },
    acceptWebSocket: vi.fn((ws: MockWebSocket) => {
      websockets.push(ws);
    }),
    getWebSockets: vi.fn(() => websockets),
    blockConcurrencyWhile: vi.fn(async (fn: () => Promise<void>) => fn()),
  } as unknown as DurableObjectState;
}

function makeUpgradeRequest(opts: {
  listId?: string;
  userId?: string;
  shareToken?: string;
} = {}) {
  const headers: Record<string, string> = { Upgrade: 'websocket' };
  if (opts.listId) headers['X-List-Id'] = opts.listId;
  if (opts.userId) headers['X-User-Id'] = opts.userId;
  if (opts.shareToken) headers['X-Share-Token'] = opts.shareToken;
  return new Request('http://localhost/ws', { headers });
}

function getItems(dobj: ShoppingListDO): Map<string, ShoppingListItem> {
  return (dobj as unknown as { items: Map<string, ShoppingListItem> }).items;
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('ShoppingListDO', () => {
  let env: Env;
  let state: DurableObjectState;
  let dobj: ShoppingListDO;

  beforeEach(() => {
    env = createMockEnv();
    state = createMockState();
    dobj = new ShoppingListDO(state, env);
  });

  describe('fetch — WebSocket upgrade', () => {
    it('returns 426 for non-WebSocket requests', async () => {
      const req = new Request('http://localhost/ws');
      const res = await dobj.fetch(req);
      expect(res.status).toBe(426);
    });

    it('returns 401 when no auth info provided', async () => {
      const req = new Request('http://localhost/ws', {
        headers: { Upgrade: 'websocket' },
      });
      const res = await dobj.fetch(req);
      expect(res.status).toBe(401);
    });

    it('accepts WebSocket with userId and calls acceptWebSocket', async () => {
      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      const res = await dobj.fetch(req);
      expect(res.status).toBe(101);
      expect(state.acceptWebSocket).toHaveBeenCalled();
    });

    it('sends initial state message on connection', async () => {
      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      expect(lastServerWs.sentMessages.length).toBe(1);
      const stateMsg = JSON.parse(lastServerWs.sentMessages[0] as string);
      expect(stateMsg.type).toBe('state');
      expect(stateMsg.items).toEqual([]);
      expect(stateMsg.seq).toBe(0);
    });

    it('accepts WebSocket with share token', async () => {
      const req = makeUpgradeRequest({ shareToken: 'token-abc', listId: 'list-1' });
      const res = await dobj.fetch(req);
      expect(res.status).toBe(101);
    });

    it('returns 429 when max connections exceeded', async () => {
      for (let i = 0; i < 10; i++) {
        const req = makeUpgradeRequest({ userId: `user-${i}`, listId: 'list-1' });
        await dobj.fetch(req);
      }

      const req = makeUpgradeRequest({ userId: 'user-11', listId: 'list-1' });
      const res = await dobj.fetch(req);
      expect(res.status).toBe(429);
    });
  });

  describe('webSocketMessage — add_item', () => {
    it('adds a manual item and schedules flush', async () => {
      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      const ws = lastServerWs;
      await dobj.webSocketMessage(ws as unknown as WebSocket, JSON.stringify({
        type: 'add_item',
        item: { text: '2 cups flour' },
      }));

      const items = getItems(dobj);
      expect(items.size).toBe(1);
      const addedItem = Array.from(items.values())[0]!;
      expect(addedItem.original_text).toBe('2 cups flour');
      expect(addedItem.item).toBe('2 cups flour');
      expect(addedItem.source).toBe('manual');
      expect(state.storage.setAlarm).toHaveBeenCalled();
    });
  });

  describe('webSocketMessage — check_item', () => {
    it('toggles checked on an existing item', async () => {
      const existingItem = makeItem({ id: 'item-1' });
      env = createMockEnv([existingItem]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'check_item',
        item_id: 'item-1',
        checked: true,
      }));

      expect(getItems(dobj).get('item-1')?.checked).toBe(1);
    });

    it('ignores check for non-existent item', async () => {
      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'check_item',
        item_id: 'nonexistent',
        checked: true,
      }));

      expect(getItems(dobj).size).toBe(0);
    });
  });

  describe('webSocketMessage — remove_item', () => {
    it('removes an item from in-memory state', async () => {
      const existingItem = makeItem({ id: 'item-1' });
      env = createMockEnv([existingItem]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'remove_item',
        item_id: 'item-1',
      }));

      expect(getItems(dobj).has('item-1')).toBe(false);
    });
  });

  describe('webSocketMessage — update_quantity', () => {
    it('updates quantity on an existing item', async () => {
      const existingItem = makeItem({ id: 'item-1', quantity: 1 });
      env = createMockEnv([existingItem]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'update_quantity',
        item_id: 'item-1',
        quantity: 5,
      }));

      expect(getItems(dobj).get('item-1')?.quantity).toBe(5);
    });
  });

  describe('webSocketMessage — uncheck_all', () => {
    it('sets all items to unchecked', async () => {
      const items = [
        makeItem({ id: 'item-1', checked: 1 }),
        makeItem({ id: 'item-2', checked: 1 }),
        makeItem({ id: 'item-3', checked: 0 }),
      ];
      env = createMockEnv(items);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({ type: 'uncheck_all' }));

      for (const item of getItems(dobj).values()) {
        expect(item.checked).toBe(0);
      }
    });
  });

  describe('webSocketMessage — reconnect', () => {
    it('sends full state when replay buffer is empty', async () => {
      env = createMockEnv([makeItem({ id: 'item-1' })]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      // Clear initial state message
      lastServerWs.sentMessages = [];

      await dobj.webSocketMessage(
        lastServerWs as unknown as WebSocket,
        JSON.stringify({ type: 'reconnect', last_seq: 0 }),
      );

      expect(lastServerWs.sentMessages.length).toBeGreaterThan(0);
      const raw = lastServerWs.sentMessages[lastServerWs.sentMessages.length - 1] as string;
      const msg = JSON.parse(raw);
      expect(msg.type).toBe('state');
      expect(msg.items).toHaveLength(1);
    });
  });

  describe('webSocketMessage — invalid', () => {
    it('sends error for invalid JSON', async () => {
      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      lastServerWs.sentMessages = [];

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, 'not-json{{{');

      expect(lastServerWs.sentMessages.length).toBe(1);
      const errMsg = JSON.parse(lastServerWs.sentMessages[0] as string);
      expect(errMsg.type).toBe('error');
      expect(errMsg.message).toBe('Invalid JSON');
    });
  });

  describe('alarm — batch D1 writes', () => {
    it('flushes pending writes to D1 via batch', async () => {
      const existingItem = makeItem({ id: 'item-1' });
      env = createMockEnv([existingItem]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'check_item',
        item_id: 'item-1',
        checked: true,
      }));

      await dobj.alarm();

      expect(env.USERS_DB!.batch).toHaveBeenCalled();
    });

    it('does not call batch when no pending writes', async () => {
      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.alarm();

      expect(env.USERS_DB!.batch).not.toHaveBeenCalled();
    });
  });

  describe('webSocketClose', () => {
    it('flushes writes when last connection closes', async () => {
      env = createMockEnv([makeItem({ id: 'item-1' })]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'check_item',
        item_id: 'item-1',
        checked: true,
      }));

      await dobj.webSocketClose(lastServerWs as unknown as WebSocket, 1000, 'normal', true);

      expect(env.USERS_DB!.batch).toHaveBeenCalled();
    });
  });

  describe('notify-parsing-complete', () => {
    it('updates items and broadcasts parsing_complete', async () => {
      env = createMockEnv([makeItem({ id: 'item-1', parsing: 1 })]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      // Connect to load items
      const wsReq = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(wsReq);

      const parsedItem = makeItem({
        id: 'item-1',
        parsing: 0,
        quantity: 2,
        unit: 'cup',
        item: 'flour',
      });

      const notifyReq = new Request('http://localhost/notify-parsing-complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [parsedItem] }),
      });

      const res = await dobj.fetch(notifyReq);
      expect(res.status).toBe(200);

      const updated = getItems(dobj).get('item-1');
      expect(updated?.parsing).toBe(0);
      expect(updated?.quantity).toBe(2);
      expect(updated?.item).toBe('flour');
    });
  });

  describe('monotonic seq numbers', () => {
    it('increments seq with each server message', async () => {
      env = createMockEnv([
        makeItem({ id: 'item-1' }),
        makeItem({ id: 'item-2' }),
      ]);
      state = createMockState();
      dobj = new ShoppingListDO(state, env);

      const req = makeUpgradeRequest({ userId: 'user-1', listId: 'list-1' });
      await dobj.fetch(req);

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'check_item',
        item_id: 'item-1',
        checked: true,
      }));

      await dobj.webSocketMessage(lastServerWs as unknown as WebSocket, JSON.stringify({
        type: 'check_item',
        item_id: 'item-2',
        checked: true,
      }));

      const seq = (dobj as unknown as { seq: number }).seq;
      expect(seq).toBe(2);
    });
  });
});
