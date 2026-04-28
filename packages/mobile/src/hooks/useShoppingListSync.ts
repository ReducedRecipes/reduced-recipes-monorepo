import { useEffect, useRef, useCallback } from "react";
import { useShoppingStore } from "../stores/shopping.store";
import { categoriseIngredient } from "../lib/categorise";
import type { ServerMessage, ShoppingListItem } from "@rr/shared";

const API_BASE =
  process.env.EXPO_PUBLIC_API_BASE || "https://reducedrecipes.com";

function buildWsUrl(listId: string): string {
  const base = API_BASE.replace(/^http/, "ws");
  return `${base}/api/v1/shopping-lists/${encodeURIComponent(listId)}/ws`;
}

function serverItemToLocal(item: ShoppingListItem) {
  return {
    id: item.id,
    text: item.original_text,
    category: categoriseIngredient(item.original_text),
    checked: item.checked === 1,
    recipeId: item.recipe_id,
    recipeTitle: null,
  };
}

const MAX_BACKOFF = 30_000;
const INITIAL_BACKOFF = 1_000;

/**
 * Connects a WebSocket to the given shared shopping list for real-time
 * updates. Only connects when `listId` is non-null and `enabled` is true.
 * Handles auto-reconnect with exponential backoff.
 */
export function useShoppingListSync(
  listId: string | null,
  enabled: boolean = false,
) {
  const wsRef = useRef<WebSocket | null>(null);
  const backoffRef = useRef(INITIAL_BACKOFF);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onerror = null;
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(
    (id: string) => {
      if (!mountedRef.current) return;
      cleanup();

      const url = buildWsUrl(id);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        backoffRef.current = INITIAL_BACKOFF;
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(event.data as string) as ServerMessage;
        } catch {
          return;
        }

        const store = useShoppingStore.getState();

        switch (msg.type) {
          case "state": {
            const localItems = msg.items.map(serverItemToLocal);
            useShoppingStore.setState({
              items: localItems,
              serverItems: msg.items,
            });
            break;
          }

          case "item_added": {
            const newLocal = serverItemToLocal(msg.item);
            useShoppingStore.setState({
              items: [...store.items, newLocal],
              serverItems: [...store.serverItems, msg.item],
            });
            break;
          }

          case "item_checked": {
            useShoppingStore.setState({
              items: store.items.map((i) =>
                i.id === msg.item_id
                  ? { ...i, checked: msg.checked }
                  : i,
              ),
              serverItems: store.serverItems.map((i) =>
                i.id === msg.item_id
                  ? { ...i, checked: msg.checked ? 1 : 0 }
                  : i,
              ),
            });
            break;
          }

          case "item_removed": {
            useShoppingStore.setState({
              items: store.items.filter((i) => i.id !== msg.item_id),
              serverItems: store.serverItems.filter(
                (i) => i.id !== msg.item_id,
              ),
            });
            break;
          }

          case "item_updated": {
            const updated = serverItemToLocal(msg.item);
            useShoppingStore.setState({
              items: store.items.map((i) =>
                i.id === msg.item.id ? updated : i,
              ),
              serverItems: store.serverItems.map((i) =>
                i.id === msg.item.id ? msg.item : i,
              ),
            });
            break;
          }

          case "all_unchecked": {
            useShoppingStore.setState({
              items: store.items.map((i) => ({ ...i, checked: false })),
              serverItems: store.serverItems.map((i) => ({
                ...i,
                checked: 0,
              })),
            });
            break;
          }

          case "parsing_complete": {
            const newItems = msg.items.map(serverItemToLocal);
            useShoppingStore.setState({
              items: [...store.items, ...newItems],
              serverItems: [...store.serverItems, ...msg.items],
            });
            break;
          }

          case "error":
            // Server-side error; no state change needed
            break;
        }
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        const delay = backoffRef.current;
        backoffRef.current = Math.min(delay * 2, MAX_BACKOFF);
        reconnectTimerRef.current = setTimeout(() => {
          if (mountedRef.current) connect(id);
        }, delay);
      };
    },
    [cleanup],
  );

  useEffect(() => {
    mountedRef.current = true;

    if (listId && enabled) {
      connect(listId);
    }

    return () => {
      mountedRef.current = false;
      cleanup();
    };
  }, [listId, enabled, connect, cleanup]);
}
