import type { Env } from '@rr/shared/env';
import type {
  ShoppingListItem,
  ClientMessage,
  ServerMessage,
} from '@rr/shared';

const MAX_CONNECTIONS = 10;
const BUFFER_SIZE = 100;
const ALARM_INTERVAL_MS = 1500;
const SHARE_REVALIDATION_MS = 60_000;

interface SessionInfo {
  userId: string | null;
  shareToken: string | null;
  lastShareCheck: number;
}

/**
 * ShoppingListDO — Durable Object that manages real-time WebSocket collaboration
 * for a shopping list. Handles message broadcasting, batched D1 writes via alarm,
 * and reconnection with replay from a ring buffer.
 */
export class ShoppingListDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private sessions: Map<WebSocket, SessionInfo> = new Map();
  private items: Map<string, ShoppingListItem> = new Map();
  private seq = 0;
  private messageBuffer: ServerMessage[] = [];
  private pendingWrites: Array<{ sql: string; params: unknown[] }> = [];
  private initialized = false;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
    this.state.getWebSockets().forEach((ws) => {
      const attachment = ws.deserializeAttachment() as SessionInfo | null;
      if (attachment) {
        this.sessions.set(ws, attachment);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Check connection limit
    if (this.sessions.size >= MAX_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    // Extract auth info from headers
    const userId = request.headers.get('X-User-Id');
    const shareToken = request.headers.get('X-Share-Token');

    if (!userId && !shareToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Get the list ID from the URL path
    const listId = url.pathname.split('/').pop() || this.state.id.toString();

    // Load items on first connection
    if (!this.initialized) {
      await this.loadItems(listId);
      this.initialized = true;
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    const session: SessionInfo = {
      userId,
      shareToken,
      lastShareCheck: Date.now(),
    };

    this.state.acceptWebSocket(server);
    server.serializeAttachment(session);
    this.sessions.set(server, session);

    // Send initial state
    const stateMsg: ServerMessage = {
      type: 'state',
      items: Array.from(this.items.values()),
      seq: this.seq,
    };
    server.send(JSON.stringify(stateMsg));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw);

    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' } satisfies ServerMessage));
      return;
    }

    const session = this.sessions.get(ws);
    if (!session) {
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown session' } satisfies ServerMessage));
      return;
    }

    // Re-validate share token periodically
    if (session.shareToken && Date.now() - session.lastShareCheck > SHARE_REVALIDATION_MS) {
      const valid = await this.validateShareToken(session.shareToken);
      if (!valid) {
        ws.send(JSON.stringify({ type: 'error', message: 'Share token expired' } satisfies ServerMessage));
        ws.close(4001, 'Share token expired');
        this.sessions.delete(ws);
        return;
      }
      session.lastShareCheck = Date.now();
      ws.serializeAttachment(session);
    }

    switch (msg.type) {
      case 'add_item':
        await this.handleAddItem(ws, msg);
        break;
      case 'check_item':
        await this.handleCheckItem(ws, msg);
        break;
      case 'remove_item':
        await this.handleRemoveItem(ws, msg);
        break;
      case 'update_quantity':
        await this.handleUpdateQuantity(ws, msg);
        break;
      case 'uncheck_all':
        await this.handleUncheckAll(ws);
        break;
      case 'reconnect':
        this.handleReconnect(ws, msg);
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' } satisfies ServerMessage));
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    this.sessions.delete(ws);
    if (this.sessions.size === 0) {
      await this.flushPendingWrites();
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.sessions.delete(ws);
  }

  async alarm(): Promise<void> {
    await this.flushPendingWrites();
  }

  // ── Message handlers ─────────────────────────────────────────────────

  private async handleAddItem(sender: WebSocket, msg: Extract<ClientMessage, { type: 'add_item' }>): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const listId = this.getListId();

    const item: ShoppingListItem = {
      id,
      shopping_list_id: listId,
      recipe_id: null,
      original_text: msg.item.text,
      quantity: null,
      unit: null,
      item: msg.item.text.toLowerCase(),
      checked: 0,
      parse_failed: 0,
      parsing: 0,
      source: 'manual',
      position: this.items.size,
      created_at: now,
      updated_at: now,
    };

    this.items.set(id, item);
    this.seq++;

    this.pendingWrites.push({
      sql: `INSERT INTO shopping_list_items (id, shopping_list_id, recipe_id, original_text, quantity, unit, item, checked, parse_failed, parsing, source, position, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'manual', ?, ?, ?)`,
      params: [id, listId, null, msg.item.text, null, null, msg.item.text.toLowerCase(), this.items.size - 1, now, now],
    });

    await this.scheduleAlarm();

    const response: ServerMessage = { type: 'item_added', item, seq: this.seq };
    this.broadcastAndBuffer(response, sender);
  }

  private async handleCheckItem(sender: WebSocket, msg: Extract<ClientMessage, { type: 'check_item' }>): Promise<void> {
    const item = this.items.get(msg.item_id);
    if (!item) {
      sender.send(JSON.stringify({ type: 'error', message: 'Item not found' } satisfies ServerMessage));
      return;
    }

    item.checked = msg.checked ? 1 : 0;
    item.updated_at = new Date().toISOString();
    this.seq++;

    this.pendingWrites.push({
      sql: 'UPDATE shopping_list_items SET checked = ?, updated_at = ? WHERE id = ?',
      params: [item.checked, item.updated_at, msg.item_id],
    });

    await this.scheduleAlarm();

    const response: ServerMessage = { type: 'item_checked', item_id: msg.item_id, checked: msg.checked, seq: this.seq };
    this.broadcastAndBuffer(response, sender);
  }

  private async handleRemoveItem(sender: WebSocket, msg: Extract<ClientMessage, { type: 'remove_item' }>): Promise<void> {
    if (!this.items.has(msg.item_id)) {
      sender.send(JSON.stringify({ type: 'error', message: 'Item not found' } satisfies ServerMessage));
      return;
    }

    this.items.delete(msg.item_id);
    this.seq++;

    this.pendingWrites.push({
      sql: 'DELETE FROM shopping_list_items WHERE id = ?',
      params: [msg.item_id],
    });

    await this.scheduleAlarm();

    const response: ServerMessage = { type: 'item_removed', item_id: msg.item_id, seq: this.seq };
    this.broadcastAndBuffer(response, sender);
  }

  private async handleUpdateQuantity(sender: WebSocket, msg: Extract<ClientMessage, { type: 'update_quantity' }>): Promise<void> {
    const item = this.items.get(msg.item_id);
    if (!item) {
      sender.send(JSON.stringify({ type: 'error', message: 'Item not found' } satisfies ServerMessage));
      return;
    }

    item.quantity = msg.quantity;
    item.updated_at = new Date().toISOString();
    this.seq++;

    this.pendingWrites.push({
      sql: 'UPDATE shopping_list_items SET quantity = ?, updated_at = ? WHERE id = ?',
      params: [msg.quantity, item.updated_at, msg.item_id],
    });

    await this.scheduleAlarm();

    const response: ServerMessage = { type: 'item_updated', item, seq: this.seq };
    this.broadcastAndBuffer(response, sender);
  }

  private async handleUncheckAll(sender: WebSocket): Promise<void> {
    const now = new Date().toISOString();
    const listId = this.getListId();

    for (const item of this.items.values()) {
      if (item.checked) {
        item.checked = 0;
        item.updated_at = now;
      }
    }
    this.seq++;

    this.pendingWrites.push({
      sql: 'UPDATE shopping_list_items SET checked = 0, updated_at = ? WHERE shopping_list_id = ? AND checked = 1',
      params: [now, listId],
    });

    await this.scheduleAlarm();

    const response: ServerMessage = { type: 'all_unchecked', seq: this.seq };
    this.broadcastAndBuffer(response, sender);
  }

  private handleReconnect(ws: WebSocket, msg: Extract<ClientMessage, { type: 'reconnect' }>): void {
    const lastSeq = msg.last_seq;

    // Find messages after last_seq in buffer
    const missed = this.messageBuffer.filter((m) => {
      if ('seq' in m && typeof m.seq === 'number') {
        return m.seq > lastSeq;
      }
      return false;
    });

    if (missed.length > 0 && missed.length < this.messageBuffer.length) {
      // Replay missed messages
      for (const m of missed) {
        ws.send(JSON.stringify(m));
      }
    } else {
      // Buffer overflow or no matching messages — send full state
      const stateMsg: ServerMessage = {
        type: 'state',
        items: Array.from(this.items.values()),
        seq: this.seq,
      };
      ws.send(JSON.stringify(stateMsg));
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private getListId(): string {
    return this.state.id.toString();
  }

  private async loadItems(listId: string): Promise<void> {
    if (!this.env.USERS_DB) return;

    try {
      const result = await this.env.USERS_DB.prepare(
        'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY position ASC, created_at ASC',
      )
        .bind(listId)
        .all();

      for (const row of result.results ?? []) {
        const item = row as unknown as ShoppingListItem;
        this.items.set(item.id, item);
      }
    } catch {
      // If DB query fails, start with empty state
    }
  }

  private broadcastAndBuffer(msg: ServerMessage, sender: WebSocket): void {
    const json = JSON.stringify(msg);

    // Buffer for reconnection replay
    this.messageBuffer.push(msg);
    if (this.messageBuffer.length > BUFFER_SIZE) {
      this.messageBuffer.shift();
    }

    // Broadcast to all connections including sender
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(json);
      } catch {
        // Connection may be dead — will be cleaned up on close/error
      }
    }
  }

  private async scheduleAlarm(): Promise<void> {
    const current = await this.state.storage.getAlarm();
    if (!current) {
      await this.state.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS);
    }
  }

  private async flushPendingWrites(): Promise<void> {
    if (this.pendingWrites.length === 0 || !this.env.USERS_DB) return;

    const writes = this.pendingWrites.splice(0);

    try {
      const statements = writes.map((w) =>
        this.env.USERS_DB!.prepare(w.sql).bind(...w.params),
      );
      await this.env.USERS_DB.batch(statements);
    } catch (err) {
      // Re-queue failed writes for next alarm
      this.pendingWrites.unshift(...writes);
      await this.scheduleAlarm();
    }
  }

  private async validateShareToken(token: string): Promise<boolean> {
    if (!this.env.USERS_DB) return false;

    const listId = this.getListId();
    const result = await this.env.USERS_DB.prepare(
      "SELECT 1 FROM shopping_lists WHERE id = ? AND share_token = ? AND (share_expires_at IS NULL OR share_expires_at > datetime('now'))",
    )
      .bind(listId, token)
      .first();

    return result !== null;
  }
}
