import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useShoppingListSocket } from "../useShoppingListSocket";
import type { ShoppingListItem, ServerMessage } from "@rr/shared";

// --- WebSocket mock ---
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];

  url: string;
  readyState = MockWebSocket.CONNECTING;
  onopen: ((ev: Event) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose(new CloseEvent("close"));
  });

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) this.onopen(new Event("open"));
  }

  simulateMessage(data: ServerMessage) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
    }
  }

  simulateClose() {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) this.onclose(new CloseEvent("close"));
  }
}

// Assign class constants as instance-accessible
Object.defineProperty(MockWebSocket.prototype, "CONNECTING", { value: 0 });
Object.defineProperty(MockWebSocket.prototype, "OPEN", { value: 1 });
Object.defineProperty(MockWebSocket.prototype, "CLOSING", { value: 2 });
Object.defineProperty(MockWebSocket.prototype, "CLOSED", { value: 3 });

const originalWebSocket = globalThis.WebSocket;

const mockItem: ShoppingListItem = {
  id: "item-1",
  shopping_list_id: "list-1",
  recipe_id: null,
  original_text: "2 cups flour",
  quantity: 2,
  unit: "cups",
  item: "flour",
  checked: 0,
  parse_failed: 0,
  parsing: 0,
  source: "manual" as const,
  position: 0,
  canonical_name: null,
  category: null,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockItem2: ShoppingListItem = {
  ...mockItem,
  id: "item-2",
  original_text: "1 egg",
  quantity: 1,
  unit: null,
  item: "egg",
  position: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
  MockWebSocket.instances = [];
  (globalThis as unknown as Record<string, unknown>).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  localStorage.setItem("session_token", "test-token-123");
});

afterEach(() => {
  vi.useRealTimers();
  (globalThis as unknown as Record<string, unknown>).WebSocket = originalWebSocket;
  localStorage.clear();
});

function latestWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1]!;
}

describe("useShoppingListSocket", () => {
  it("connects on mount with valid listId and token", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(latestWs().url).toContain("/api/v1/shopping-lists/list-1/ws");
    expect(latestWs().url).toContain("token=test-token-123");
    expect(result.current.isConnected).toBe(false);
  });

  it("does not connect without listId", () => {
    renderHook(() => useShoppingListSocket(undefined));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("does not connect when enabled is false", () => {
    renderHook(() => useShoppingListSocket("list-1", { enabled: false }));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("sets isConnected to true on open", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));

    act(() => latestWs().simulateOpen());
    expect(result.current.isConnected).toBe(true);
  });

  it("handles state message and populates items", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());

    act(() =>
      latestWs().simulateMessage({ type: "state", items: [mockItem, mockItem2], seq: 1 }),
    );

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[0]!.id).toBe("item-1");
    expect(result.current.items[1]!.id).toBe("item-2");
  });

  it("handles item_added message", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    act(() => latestWs().simulateMessage({ type: "state", items: [mockItem], seq: 1 }));

    act(() => latestWs().simulateMessage({ type: "item_added", item: mockItem2, seq: 2 }));

    expect(result.current.items).toHaveLength(2);
    expect(result.current.items[1]!.id).toBe("item-2");
  });

  it("handles item_checked message", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    act(() => latestWs().simulateMessage({ type: "state", items: [mockItem], seq: 1 }));

    act(() =>
      latestWs().simulateMessage({ type: "item_checked", item_id: "item-1", checked: true, seq: 2 }),
    );

    expect(result.current.items[0]!.checked).toBe(1);
  });

  it("handles item_removed message", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    act(() =>
      latestWs().simulateMessage({ type: "state", items: [mockItem, mockItem2], seq: 1 }),
    );

    act(() => latestWs().simulateMessage({ type: "item_removed", item_id: "item-1", seq: 2 }));

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.id).toBe("item-2");
  });

  it("handles item_updated message", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    act(() => latestWs().simulateMessage({ type: "state", items: [mockItem], seq: 1 }));

    const updatedItem = { ...mockItem, quantity: 5 };
    act(() => latestWs().simulateMessage({ type: "item_updated", item: updatedItem, seq: 2 }));

    expect(result.current.items[0]!.quantity).toBe(5);
  });

  it("handles all_unchecked message", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    const checkedItem = { ...mockItem, checked: 1 };
    act(() => latestWs().simulateMessage({ type: "state", items: [checkedItem], seq: 1 }));

    act(() => latestWs().simulateMessage({ type: "all_unchecked", seq: 2 }));

    expect(result.current.items[0]!.checked).toBe(0);
  });

  it("handles parsing_complete message (merges items)", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    act(() => latestWs().simulateMessage({ type: "state", items: [mockItem], seq: 1 }));

    const parsedItem = { ...mockItem, item: "all-purpose flour", parsing: 0 };
    act(() =>
      latestWs().simulateMessage({
        type: "parsing_complete",
        items: [parsedItem],
        seq: 2,
      }),
    );

    expect(result.current.items).toHaveLength(1);
    expect(result.current.items[0]!.item).toBe("all-purpose flour");
  });

  it("sends client messages when connected", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());

    act(() => result.current.send({ type: "add_item", item: { text: "milk" } }));

    expect(latestWs().send).toHaveBeenCalledWith(
      JSON.stringify({ type: "add_item", item: { text: "milk" } }),
    );
  });

  it("does not send messages when disconnected", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    // Not yet open — readyState is CONNECTING

    act(() => result.current.send({ type: "uncheck_all" }));
    expect(latestWs().send).not.toHaveBeenCalled();
  });

  it("auto-reconnects with exponential backoff on close", () => {
    renderHook(() => useShoppingListSocket("list-1"));
    const ws1 = latestWs();
    act(() => ws1.simulateOpen());

    // Simulate unexpected close
    act(() => ws1.simulateClose());

    expect(MockWebSocket.instances).toHaveLength(1);

    // After 1s backoff
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("sends reconnect message with last_seq on reconnection", () => {
    const { result: _result } = renderHook(() => useShoppingListSocket("list-1"));
    const ws1 = latestWs();
    act(() => ws1.simulateOpen());
    act(() => ws1.simulateMessage({ type: "state", items: [mockItem], seq: 5 }));

    // Close and reconnect
    act(() => ws1.simulateClose());
    act(() => vi.advanceTimersByTime(1000));

    const ws2 = latestWs();
    act(() => ws2.simulateOpen());

    expect(ws2.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "reconnect", last_seq: 5 }),
    );
  });

  it("uses share token when provided", () => {
    renderHook(() =>
      useShoppingListSocket("list-1", { shareToken: "share-abc" }),
    );

    expect(latestWs().url).toContain("token=share-abc");
  });

  it("cleans up WebSocket on unmount", () => {
    const { unmount } = renderHook(() => useShoppingListSocket("list-1"));
    const ws = latestWs();
    act(() => ws.simulateOpen());

    unmount();

    expect(ws.close).toHaveBeenCalled();
  });

  it("disconnect() prevents auto-reconnect", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());

    act(() => result.current.disconnect());

    // Advance past any backoff period
    act(() => vi.advanceTimersByTime(60_000));

    // Should only be the original instance (no reconnect attempts)
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it("reconnects with new listId", () => {
    const { rerender } = renderHook(
      ({ id }) => useShoppingListSocket(id),
      { initialProps: { id: "list-1" as string | undefined } },
    );

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(latestWs().url).toContain("list-1");

    rerender({ id: "list-2" });

    // Old WS closed, new one created
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    expect(latestWs().url).toContain("list-2");
  });

  it("handles error message from server gracefully", () => {
    const { result } = renderHook(() => useShoppingListSocket("list-1"));
    act(() => latestWs().simulateOpen());
    act(() => latestWs().simulateMessage({ type: "state", items: [mockItem], seq: 1 }));

    // Should not throw or change items
    act(() => latestWs().simulateMessage({ type: "error", message: "not_found" }));

    expect(result.current.items).toHaveLength(1);
  });
});
