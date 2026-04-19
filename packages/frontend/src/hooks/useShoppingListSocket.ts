import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, ShoppingListItem } from "@rr/shared";

export interface UseShoppingListSocketOptions {
  /** Share token for unauthenticated access to shared lists */
  shareToken?: string;
  /** Whether to auto-connect on mount (default: true) */
  enabled?: boolean;
}

export interface UseShoppingListSocketReturn {
  isConnected: boolean;
  items: ShoppingListItem[];
  send: (message: ClientMessage) => void;
  connect: () => void;
  disconnect: () => void;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_BACKOFF_MS = 1_000;

function getWsUrl(listId: string, token: string): string {
  const apiBase = import.meta.env.VITE_API_BASE || "";
  const base = apiBase || window.location.origin;
  const protocol = base.startsWith("https") ? "wss" : "ws";
  const host = base.replace(/^https?:\/\//, "");
  return `${protocol}://${host}/api/v1/shopping-lists/${encodeURIComponent(listId)}/ws?token=${encodeURIComponent(token)}`;
}

export function useShoppingListSocket(
  listId: string | undefined,
  options: UseShoppingListSocketOptions = {},
): UseShoppingListSocketReturn {
  const { shareToken, enabled = true } = options;
  const [isConnected, setIsConnected] = useState(false);
  const [items, setItems] = useState<ShoppingListItem[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const lastSeqRef = useRef<number>(0);
  const retriesRef = useRef<number>(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shouldConnectRef = useRef(enabled);
  const listIdRef = useRef(listId);
  const shareTokenRef = useRef(shareToken);

  // Keep refs in sync
  listIdRef.current = listId;
  shareTokenRef.current = shareToken;

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    shouldConnectRef.current = false;
    clearReconnectTimer();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
  }, [clearReconnectTimer]);

  const handleMessage = useCallback((event: MessageEvent) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }

    switch (msg.type) {
      case "state":
        setItems(msg.items);
        lastSeqRef.current = msg.seq;
        break;
      case "item_added":
        setItems((prev) => [...prev, msg.item]);
        lastSeqRef.current = msg.seq;
        break;
      case "item_checked":
        setItems((prev) =>
          prev.map((i) =>
            i.id === msg.item_id ? { ...i, checked: msg.checked ? 1 : 0 } : i,
          ),
        );
        lastSeqRef.current = msg.seq;
        break;
      case "item_removed":
        setItems((prev) => prev.filter((i) => i.id !== msg.item_id));
        lastSeqRef.current = msg.seq;
        break;
      case "item_updated":
        setItems((prev) =>
          prev.map((i) => (i.id === msg.item.id ? msg.item : i)),
        );
        lastSeqRef.current = msg.seq;
        break;
      case "all_unchecked":
        setItems((prev) => prev.map((i) => ({ ...i, checked: 0 })));
        lastSeqRef.current = msg.seq;
        break;
      case "parsing_complete":
        setItems((prev) => {
          const newIds = new Set(msg.items.map((i) => i.id));
          return [
            ...prev.filter((i) => !newIds.has(i.id)),
            ...msg.items,
          ];
        });
        lastSeqRef.current = msg.seq;
        break;
      case "error":
        // Server error — logged but no state change
        break;
    }
  }, []);

  const connect = useCallback(() => {
    const currentListId = listIdRef.current;
    if (!currentListId) return;

    // Get auth token
    const token = shareTokenRef.current ?? localStorage.getItem("session_token") ?? "";
    if (!token) return;

    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    shouldConnectRef.current = true;
    clearReconnectTimer();

    const url = getWsUrl(currentListId, token);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      retriesRef.current = 0;

      // If reconnecting, replay from last known seq
      if (lastSeqRef.current > 0) {
        ws.send(JSON.stringify({ type: "reconnect", last_seq: lastSeqRef.current }));
      }
    };

    ws.onmessage = handleMessage;

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;

      // Auto-reconnect with exponential backoff
      if (shouldConnectRef.current) {
        const backoff = Math.min(
          BASE_BACKOFF_MS * 2 ** retriesRef.current,
          MAX_BACKOFF_MS,
        );
        retriesRef.current += 1;
        reconnectTimerRef.current = setTimeout(() => {
          if (shouldConnectRef.current) {
            connect();
          }
        }, backoff);
      }
    };

    ws.onerror = () => {
      // onclose will fire after onerror, triggering reconnect
    };
  }, [clearReconnectTimer, handleMessage]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Auto-connect when listId changes and enabled
  useEffect(() => {
    if (enabled && listId) {
      lastSeqRef.current = 0;
      setItems([]);
      connect();
    }
    return () => {
      disconnect();
    };
  }, [listId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isConnected, items, send, connect, disconnect };
}
