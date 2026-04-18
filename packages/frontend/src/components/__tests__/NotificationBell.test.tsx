import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: vi.fn(),
}));

import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../hooks/useNotifications";
import NotificationBell from "../NotificationBell";

const mockUseAuth = vi.mocked(useAuth);
const mockUseNotifications = vi.mocked(useNotifications);

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUseNotifications.mockReturnValue({
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    isLoading: false,
  });
});

afterEach(cleanup);

describe("NotificationBell", () => {
  it("returns null when user is not authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    } as any);

    const { container } = renderBell();
    expect(container.innerHTML).toBe("");
  });

  it("renders bell icon when authenticated", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", name: "Test" },
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    } as any);

    renderBell();
    expect(screen.getByLabelText("Notifications")).toBeDefined();
  });

  it("shows unread badge when unreadCount > 0", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", name: "Test" },
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    } as any);

    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 3,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      isLoading: false,
    });

    renderBell();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("opens dropdown when bell is clicked", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", name: "Test" },
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    } as any);

    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: "n-1",
          user_id: "u-1",
          type: "welcome",
          payload: "Welcome to ReducedRecipes!",
          read: 0,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      isLoading: false,
    });

    renderBell();
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("Notifications")).toBeDefined();
    expect(screen.getByText("welcome")).toBeDefined();
    expect(screen.getByText("Welcome to ReducedRecipes!")).toBeDefined();
    expect(screen.getByText("Mark all read")).toBeDefined();
  });

  it("calls markRead when Read button is clicked", () => {
    const mockMarkRead = vi.fn();
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", name: "Test" },
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    } as any);

    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          id: "n-1",
          user_id: "u-1",
          type: "info",
          payload: "Test notification",
          read: 0,
          created_at: new Date().toISOString(),
        },
      ],
      unreadCount: 1,
      markRead: mockMarkRead,
      markAllRead: vi.fn(),
      isLoading: false,
    });

    renderBell();
    fireEvent.click(screen.getByLabelText("Notifications"));
    fireEvent.click(screen.getByText("Read"));
    expect(mockMarkRead).toHaveBeenCalledWith("n-1");
  });

  it("shows 'No notifications' when list is empty", () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u-1", name: "Test" },
      isAuthenticated: true,
      isLoading: false,
      isNewUser: false,
      logout: vi.fn(),
      login: vi.fn(),
      checkAuth: vi.fn(),
    } as any);

    renderBell();
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("No notifications")).toBeDefined();
  });
});
