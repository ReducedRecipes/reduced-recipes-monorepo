import type { Env } from '@rr/shared/env';
import type { ShoppingListItem, ClientMessage, ServerMessage } from '@rr/shared';

/** Maximum concurrent WebSocket connections per list. */
const MAX_CONNECTIONS = 10;

/** Interval (ms) between batched D1 writes. */
const FLUSH_INTERVAL_MS = 2000;

/** How many server messages to keep in the replay buffer. */
const REPLAY_BUFFER_SIZE = 100;

/** Interval (ms) between share token re-validations. */
const SHARE_REVALIDATION_MS = 60_000;

interface PendingWrite {
  type: 'insert' | 'update' | 'delete';
  item?: ShoppingListItem;
  item_id?: string;
  fields?: Partial<ShoppingListItem>;
}

interface ConnectionMeta {
  userId: string | null;
  shareToken: string | null;
  lastValidated: number;
}

/**
 * ShoppingListDO — Durable Object for real-time shopping list collaboration.
 *
 * Uses the WebSocket Hibernation API for efficient idle handling.
 * One instance per shopping list (keyed by list ID).
 */
export class ShoppingListDO implements DurableObject {
  private state: DurableObjectState;
  private env: Env;
  private items: Map<string, ShoppingListItem> = new Map();
  private seq = 0;
  private listId: string | null = null;
  private loaded = false;
  private pendingWrites: PendingWrite[] = [];
  private replayBuffer: ServerMessage[] = [];
  private connections: Map<WebSocket, ConnectionMeta> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader !== 'websocket') {
      // Non-WebSocket requests: used for notifications from the parse consumer
      if (url.pathname === '/notify-parsing-complete') {
        return this.handleParsingComplete(request);
      }
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    if (this.connections.size >= MAX_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    // Extract auth info from headers (set by the API route handler)
    const userId = request.headers.get('X-User-Id');
    const shareToken = request.headers.get('X-Share-Token');

    if (!userId && !shareToken) {
      return new Response('Unauthorized', { status: 401 });
    }

    // Extract list ID from the request path or header
    const headerListId = request.headers.get('X-List-Id');
    if (headerListId) {
      this.listId = headerListId;
    }

    // Ensure items are loaded from D1
    await this.ensureLoaded();

    // Create WebSocket pair using Hibernation API
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    this.state.acceptWebSocket(server);
    this.connections.set(server, {
      userId,
      shareToken,
      lastValidated: Date.now(),
    });

    // Send initial state
    const stateMsg: ServerMessage = {
      type: 'state',
      items: Array.from(this.items.values()),
      seq: this.seq,
    };
    server.send(JSON.stringify(stateMsg));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, rawMessage: string | ArrayBuffer): Promise<void> {
    const text = typeof rawMessage === 'string' ? rawMessage : new TextDecoder().decode(rawMessage);

    let msg: ClientMessage;
    try {
      msg = JSON.parse(text) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    await this.ensureLoaded();

    // Re-validate share token if needed
    const meta = this.connections.get(ws);
    if (meta?.shareToken) {
      const now = Date.now();
      if (now - meta.lastValidated > SHARE_REVALIDATION_MS) {
        const valid = await this.validateShareToken(meta.shareToken);
        if (!valid) {
          ws.send(JSON.stringify({ type: 'error', message: 'Share token expired' }));
          ws.close(4001, 'Share token expired');
          this.connections.delete(ws);
          return;
        }
        meta.lastValidated = now;
      }
    }

    switch (msg.type) {
      case 'add_item':
        await this.handleAddItem(ws, msg.item.text);
        break;
      case 'check_item':
        await this.handleCheckItem(ws, msg.item_id, msg.checked);
        break;
      case 'remove_item':
        await this.handleRemoveItem(ws, msg.item_id);
        break;
      case 'update_quantity':
        await this.handleUpdateQuantity(ws, msg.item_id, msg.quantity);
        break;
      case 'uncheck_all':
        await this.handleUncheckAll(ws);
        break;
      case 'reconnect':
        this.handleReconnect(ws, msg.last_seq);
        break;
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
    }
  }

  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    this.connections.delete(ws);
    if (this.connections.size === 0) {
      // Flush pending writes before hibernation
      await this.flushWrites();
    }
  }

  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    this.connections.delete(ws);
  }

  async alarm(): Promise<void> {
    await this.flushWrites();
    // If there are still connections, schedule next flush
    if (this.connections.size > 0 && this.pendingWrites.length > 0) {
      await this.state.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS);
    }
  }

  // ── Message Handlers ──────────────────────────────────────────

  private async handleAddItem(_sender: WebSocket, text: string): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const item: ShoppingListItem = {
      id,
      shopping_list_id: this.listId ?? '',
      recipe_id: null,
      original_text: text,
      quantity: null,
      unit: null,
      item: text,
      checked: 0,
      parse_failed: 0,
      parsing: 0,
      source: 'manual',
      position: this.items.size,
      created_at: now,
      updated_at: now,
    };

    this.items.set(id, item);
    this.pendingWrites.push({ type: 'insert', item });
    await this.scheduleFlush();

    const serverMsg: ServerMessage = { type: 'item_added', item, seq: ++this.seq };
    this.broadcastAndBuffer(serverMsg);
  }

  private async handleCheckItem(_sender: WebSocket, itemId: string, checked: boolean): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) return;

    item.checked = checked ? 1 : 0;
    item.updated_at = new Date().toISOString();
    this.pendingWrites.push({
      type: 'update',
      item_id: itemId,
      fields: { checked: item.checked, updated_at: item.updated_at },
    });
    await this.scheduleFlush();

    const serverMsg: ServerMessage = {
      type: 'item_checked',
      item_id: itemId,
      checked,
      seq: ++this.seq,
    };
    this.broadcastAndBuffer(serverMsg);
  }

  private async handleRemoveItem(_sender: WebSocket, itemId: string): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) return;

    this.items.delete(itemId);
    this.pendingWrites.push({ type: 'delete', item_id: itemId });
    await this.scheduleFlush();

    const serverMsg: ServerMessage = { type: 'item_removed', item_id: itemId, seq: ++this.seq };
    this.broadcastAndBuffer(serverMsg);
  }

  private async handleUpdateQuantity(_sender: WebSocket, itemId: string, quantity: number): Promise<void> {
    const item = this.items.get(itemId);
    if (!item) return;

    item.quantity = quantity;
    item.updated_at = new Date().toISOString();
    this.pendingWrites.push({
      type: 'update',
      item_id: itemId,
      fields: { quantity, updated_at: item.updated_at },
    });
    await this.scheduleFlush();

    const serverMsg: ServerMessage = { type: 'item_updated', item, seq: ++this.seq };
    this.broadcastAndBuffer(serverMsg);
  }

  private async handleUncheckAll(_sender: WebSocket): Promise<void> {
    const now = new Date().toISOString();
    for (const item of this.items.values()) {
      if (item.checked) {
        item.checked = 0;
        item.updated_at = now;
        this.pendingWrites.push({
          type: 'update',
          item_id: item.id,
          fields: { checked: 0, updated_at: now },
        });
      }
    }
    await this.scheduleFlush();

    const serverMsg: ServerMessage = { type: 'all_unchecked', seq: ++this.seq };
    this.broadcastAndBuffer(serverMsg);
  }

  private handleReconnect(ws: WebSocket, lastSeq: number): void {
    // Find messages in replay buffer since lastSeq
    const missedMessages = this.replayBuffer.filter(
      (msg) => 'seq' in msg && (msg as { seq: number }).seq > lastSeq,
    );

    if (missedMessages.length > 0 && lastSeq >= this.seq - REPLAY_BUFFER_SIZE) {
      // Send missed messages in order
      for (const msg of missedMessages) {
        ws.send(JSON.stringify(msg));
      }
    } else {
      // Buffer overflow or too far behind — send full state
      const stateMsg: ServerMessage = {
        type: 'state',
        items: Array.from(this.items.values()),
        seq: this.seq,
      };
      ws.send(JSON.stringify(stateMsg));
    }
  }

  // ── Parsing Complete Notification ──────────────────────────────

  private async handleParsingComplete(request: Request): Promise<Response> {
    try {
      const body = await request.json<{ items: ShoppingListItem[] }>();
      await this.ensureLoaded();

      // Update in-memory items
      for (const parsedItem of body.items) {
        this.items.set(parsedItem.id, parsedItem);
      }

      const serverMsg: ServerMessage = {
        type: 'parsing_complete',
        items: body.items,
        seq: ++this.seq,
      };
      this.broadcastAndBuffer(serverMsg);

      return new Response('OK', { status: 200 });
    } catch {
      return new Response('Bad request', { status: 400 });
    }
  }

  // ── Broadcasting ──────────────────────────────────────────────

  private broadcastAndBuffer(msg: ServerMessage): void {
    const json = JSON.stringify(msg);

    // Add to replay buffer
    this.replayBuffer.push(msg);
    if (this.replayBuffer.length > REPLAY_BUFFER_SIZE) {
      this.replayBuffer.shift();
    }

    // Broadcast to all connected WebSocket clients
    const sockets = this.state.getWebSockets();
    for (const ws of sockets) {
      try {
        ws.send(json);
      } catch {
        // Connection may have closed; will be cleaned up on close event
      }
    }
  }

  // ── D1 Batch Writes ──────────────────────────────────────────

  private async scheduleFlush(): Promise<void> {
    const currentAlarm = await this.state.storage.getAlarm();
    if (!currentAlarm) {
      await this.state.storage.setAlarm(Date.now() + FLUSH_INTERVAL_MS);
    }
  }

  private async flushWrites(): Promise<void> {
    if (this.pendingWrites.length === 0) return;

    const writes = [...this.pendingWrites];
    this.pendingWrites = [];

    const db = this.env.USERS_DB;
    if (!db) return;

    const stmts: D1PreparedStatement[] = [];

    for (const write of writes) {
      switch (write.type) {
        case 'insert': {
          const item = write.item!;
          stmts.push(
            db.prepare(
              `INSERT INTO shopping_list_items (id, shopping_list_id, recipe_id, original_text, quantity, unit, item, checked, parse_failed, parsing, source, position, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            ).bind(
              item.id, item.shopping_list_id, item.recipe_id, item.original_text,
              item.quantity, item.unit, item.item, item.checked,
              item.parse_failed, item.parsing, item.source, item.position,
              item.created_at, item.updated_at,
            ),
          );
          break;
        }
        case 'update': {
          const fields = write.fields!;
          const sets: string[] = [];
          const values: (string | number | null)[] = [];

          if (fields.checked !== undefined) {
            sets.push('checked = ?');
            values.push(fields.checked);
          }
          if (fields.quantity !== undefined) {
            sets.push('quantity = ?');
            values.push(fields.quantity);
          }
          if (fields.updated_at !== undefined) {
            sets.push('updated_at = ?');
            values.push(fields.updated_at);
          }

          if (sets.length > 0) {
            values.push(write.item_id!);
            stmts.push(
              db.prepare(
                `UPDATE shopping_list_items SET ${sets.join(', ')} WHERE id = ?`,
              ).bind(...values),
            );
          }
          break;
        }
        case 'delete': {
          stmts.push(
            db.prepare('DELETE FROM shopping_list_items WHERE id = ?').bind(write.item_id!),
          );
          break;
        }
      }
    }

    if (stmts.length > 0) {
      try {
        await db.batch(stmts);
      } catch (err) {
        // Re-queue failed writes for retry
        console.error('Failed to flush D1 writes:', err);
        this.pendingWrites.unshift(...writes);
      }
    }
  }

  // ── Data Loading ──────────────────────────────────────────────

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;

    const db = this.env.USERS_DB;
    if (!db || !this.listId) {
      this.loaded = true;
      return;
    }

    const result = await db.prepare(
      'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY position ASC, created_at ASC',
    ).bind(this.listId).all();

    for (const row of result.results ?? []) {
      const item = row as unknown as ShoppingListItem;
      this.items.set(item.id, item);
    }

    this.loaded = true;
  }

  // ── Share Token Validation ────────────────────────────────────

  private async validateShareToken(token: string): Promise<boolean> {
    const db = this.env.USERS_DB;
    if (!db || !this.listId) return false;

    const row = await db.prepare(
      "SELECT 1 FROM shopping_lists WHERE id = ? AND share_token = ? AND share_expires_at > datetime('now')",
    ).bind(this.listId, token).first();

    return !!row;
  }
}
