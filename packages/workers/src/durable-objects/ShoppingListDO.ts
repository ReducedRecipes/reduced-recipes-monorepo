import { DurableObject } from 'cloudflare:workers';
import type { Env } from '@rr/shared/env';
import type { ShoppingListItem, ClientMessage, ServerMessage } from '@rr/shared';
import { validateShareToken } from '../routes/shopping-lists';

const MAX_CONNECTIONS = 10;
const ALARM_INTERVAL_MS = 1500;

interface MutationEntry {
  sql: string;
  params: unknown[];
}

/**
 * ShoppingListDO — Durable Object for real-time shopping list collaboration.
 * Uses WebSocket Hibernation API for efficient connection handling.
 */
export class ShoppingListDO extends DurableObject<Env> {
  private seq = 0;
  private mutationBuffer: MutationEntry[] = [];
  private messageHistory: ServerMessage[] = [];

  /**
   * Handle incoming HTTP requests — only WebSocket upgrades are accepted.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const upgradeHeader = request.headers.get('Upgrade');

    if (!upgradeHeader || upgradeHeader.toLowerCase() !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    // Auth: either Bearer token (authenticated user) or share_token query param
    const authHeader = request.headers.get('Authorization');
    const shareToken = url.searchParams.get('share_token');
    const listId = url.searchParams.get('list_id');

    if (!listId) {
      return new Response('Missing list_id parameter', { status: 400 });
    }

    let userId: string | null = null;

    if (authHeader?.startsWith('Bearer ')) {
      const sessionToken = authHeader.slice(7);
      // Validate session via KV
      const sessionData = await this.env.SESSION_KV?.get(sessionToken);
      if (!sessionData) {
        return new Response('Invalid session', { status: 401 });
      }
      const session = JSON.parse(sessionData) as { userId: string };
      userId = session.userId;

      // Verify list ownership
      const list = await this.env.USERS_DB!.prepare(
        'SELECT id FROM shopping_lists WHERE id = ? AND user_id = ?',
      )
        .bind(listId, userId)
        .first();

      if (!list) {
        return new Response('Shopping list not found', { status: 404 });
      }
    } else if (shareToken) {
      const valid = await validateShareToken(this.env.USERS_DB!, listId, shareToken);
      if (!valid) {
        return new Response('Invalid or expired share token', { status: 401 });
      }
    } else {
      return new Response('Authentication required', { status: 401 });
    }

    // Check connection limit
    const existingConnections = this.ctx.getWebSockets();
    if (existingConnections.length >= MAX_CONNECTIONS) {
      return new Response('Too many connections', { status: 429 });
    }

    // Create WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Tag the WebSocket with metadata for later use
    this.ctx.acceptWebSocket(server, [listId, userId ?? 'anonymous']);

    // Send initial state
    const items = await this.getItems(listId);
    this.seq++;
    const stateMsg: ServerMessage = { type: 'state', items, seq: this.seq };
    this.messageHistory.push(stateMsg);
    server.send(JSON.stringify(stateMsg));

    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Handle incoming WebSocket messages (Hibernation API callback).
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const data = typeof message === 'string' ? message : new TextDecoder().decode(message);

    let msg: ClientMessage;
    try {
      msg = JSON.parse(data) as ClientMessage;
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' } satisfies ServerMessage));
      return;
    }

    const tags = this.ctx.getTags(ws);
    const listId = tags[0];

    if (!listId) {
      ws.send(JSON.stringify({ type: 'error', message: 'No list context' } satisfies ServerMessage));
      return;
    }

    switch (msg.type) {
      case 'add_item':
        await this.handleAddItem(listId, msg);
        break;
      case 'check_item':
        await this.handleCheckItem(listId, msg);
        break;
      case 'remove_item':
        await this.handleRemoveItem(listId, msg);
        break;
      case 'update_quantity':
        await this.handleUpdateQuantity(listId, msg);
        break;
      case 'uncheck_all':
        await this.handleUncheckAll(listId);
        break;
      case 'reconnect':
        this.handleReconnect(ws, msg);
        return; // Don't broadcast reconnect
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' } satisfies ServerMessage));
        return;
    }
  }

  /**
   * Handle WebSocket close (Hibernation API callback).
   */
  async webSocketClose(ws: WebSocket, _code: number, _reason: string, _wasClean: boolean): Promise<void> {
    ws.close();
  }

  /**
   * Handle WebSocket error (Hibernation API callback).
   */
  async webSocketError(ws: WebSocket, _error: unknown): Promise<void> {
    ws.close();
  }

  /**
   * Alarm handler — flush mutation buffer to D1.
   */
  async alarm(): Promise<void> {
    await this.flushMutationBuffer();
  }

  // ── Message handlers ──────────────────────────────────────────────────

  private async handleAddItem(listId: string, msg: Extract<ClientMessage, { type: 'add_item' }>): Promise<void> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const item: ShoppingListItem = {
      id,
      shopping_list_id: listId,
      recipe_id: null,
      original_text: msg.item.text,
      quantity: null,
      unit: null,
      item: msg.item.text.toLowerCase(),
      canonical_name: null,
      category: null,
      checked: 0,
      parse_failed: 0,
      parsing: 0,
      source: 'manual',
      position: 0,
      created_at: now,
      updated_at: now,
    };

    this.bufferMutation(
      `INSERT INTO shopping_list_items (id, shopping_list_id, recipe_id, original_text, quantity, unit, item, checked, parse_failed, parsing, source, position, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 'manual', 0, ?, ?)`,
      [id, listId, null, item.original_text, null, null, item.item, now, now],
    );

    this.seq++;
    const serverMsg: ServerMessage = { type: 'item_added', item, seq: this.seq };
    this.messageHistory.push(serverMsg);
    this.broadcast(serverMsg);
  }

  private async handleCheckItem(listId: string, msg: Extract<ClientMessage, { type: 'check_item' }>): Promise<void> {
    const now = new Date().toISOString();
    const checked = msg.checked ? 1 : 0;

    this.bufferMutation(
      'UPDATE shopping_list_items SET checked = ?, updated_at = ? WHERE id = ? AND shopping_list_id = ?',
      [checked, now, msg.item_id, listId],
    );

    this.seq++;
    const serverMsg: ServerMessage = { type: 'item_checked', item_id: msg.item_id, checked: msg.checked, seq: this.seq };
    this.messageHistory.push(serverMsg);
    this.broadcast(serverMsg);
  }

  private async handleRemoveItem(listId: string, msg: Extract<ClientMessage, { type: 'remove_item' }>): Promise<void> {
    this.bufferMutation(
      'DELETE FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
      [msg.item_id, listId],
    );

    this.seq++;
    const serverMsg: ServerMessage = { type: 'item_removed', item_id: msg.item_id, seq: this.seq };
    this.messageHistory.push(serverMsg);
    this.broadcast(serverMsg);
  }

  private async handleUpdateQuantity(listId: string, msg: Extract<ClientMessage, { type: 'update_quantity' }>): Promise<void> {
    const now = new Date().toISOString();

    this.bufferMutation(
      'UPDATE shopping_list_items SET quantity = ?, updated_at = ? WHERE id = ? AND shopping_list_id = ?',
      [msg.quantity, now, msg.item_id, listId],
    );

    // Fetch the updated item to broadcast
    const updatedItem = await this.env.USERS_DB!.prepare(
      'SELECT * FROM shopping_list_items WHERE id = ? AND shopping_list_id = ?',
    )
      .bind(msg.item_id, listId)
      .first<ShoppingListItem>();

    if (updatedItem) {
      const item = { ...updatedItem, quantity: msg.quantity, updated_at: now };
      this.seq++;
      const serverMsg: ServerMessage = { type: 'item_updated', item, seq: this.seq };
      this.messageHistory.push(serverMsg);
      this.broadcast(serverMsg);
    }
  }

  private async handleUncheckAll(listId: string): Promise<void> {
    const now = new Date().toISOString();

    this.bufferMutation(
      'UPDATE shopping_list_items SET checked = 0, updated_at = ? WHERE shopping_list_id = ? AND checked = 1',
      [now, listId],
    );

    this.seq++;
    const serverMsg: ServerMessage = { type: 'all_unchecked', seq: this.seq };
    this.messageHistory.push(serverMsg);
    this.broadcast(serverMsg);
  }

  private handleReconnect(ws: WebSocket, msg: Extract<ClientMessage, { type: 'reconnect' }>): void {
    const missedMessages = this.messageHistory.filter((m) => 'seq' in m && m.seq > msg.last_seq);
    for (const m of missedMessages) {
      ws.send(JSON.stringify(m));
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async getItems(listId: string): Promise<ShoppingListItem[]> {
    const result = await this.env.USERS_DB!.prepare(
      'SELECT * FROM shopping_list_items WHERE shopping_list_id = ? ORDER BY created_at ASC',
    )
      .bind(listId)
      .all();

    return (result.results ?? []) as unknown as ShoppingListItem[];
  }

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Connection may have closed; ignore
      }
    }
  }

  private bufferMutation(sql: string, params: unknown[]): void {
    this.mutationBuffer.push({ sql, params });
    // Schedule alarm to flush buffer if not already scheduled
    this.ctx.storage.setAlarm(Date.now() + ALARM_INTERVAL_MS).catch(() => {
      // Alarm may already be set; ignore
    });
  }

  private async flushMutationBuffer(): Promise<void> {
    if (this.mutationBuffer.length === 0) return;

    const mutations = [...this.mutationBuffer];
    this.mutationBuffer = [];

    const db = this.env.USERS_DB!;
    const statements = mutations.map((m) => db.prepare(m.sql).bind(...m.params));

    await db.batch(statements);
  }
}
