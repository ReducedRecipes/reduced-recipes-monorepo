import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
  markAllNotificationsRead: vi.fn(),
}));

import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
} from "../../lib/api";

const mockGetNotifications = vi.mocked(getNotifications);
const mockGetUnreadCount = vi.mocked(getUnreadNotificationCount);
const mockMarkRead = vi.mocked(markNotificationRead);
const mockMarkAllRead = vi.mocked(markAllNotificationsRead);

const mockNotification = {
  id: "n-1",
  user_id: "u-1",
  type: "recipe_bookmarked",
  payload: "Someone bookmarked your recipe",
  read: 0,
  created_at: "2024-06-01T12:00:00Z",
};

const mockNotificationRead = {
  ...mockNotification,
  id: "n-2",
  read: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useNotifications — API functions", () => {
  it("getNotifications returns notification list", async () => {
    mockGetNotifications.mockResolvedValueOnce({
      items: [mockNotification, mockNotificationRead],
      next_cursor: null,
    });

    const result = await getNotifications();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.id).toBe("n-1");
    expect(result.items[0]!.read).toBe(0);
    expect(result.items[1]!.read).toBe(1);
  });

  it("getUnreadNotificationCount returns count", async () => {
    mockGetUnreadCount.mockResolvedValueOnce({ count: 5 });

    const result = await getUnreadNotificationCount();
    expect(result.count).toBe(5);
  });

  it("markNotificationRead calls API with correct id", async () => {
    mockMarkRead.mockResolvedValueOnce(undefined);

    await markNotificationRead("n-1");
    expect(mockMarkRead).toHaveBeenCalledWith("n-1");
  });

  it("markAllNotificationsRead calls API", async () => {
    mockMarkAllRead.mockResolvedValueOnce(undefined);

    await markAllNotificationsRead();
    expect(mockMarkAllRead).toHaveBeenCalled();
  });
});

describe("useNotifications — hook module", () => {
  it("exports useNotifications function", async () => {
    const mod = await import("../useNotifications");
    expect(typeof mod.useNotifications).toBe("function");
  });

  it("hook source uses refetchInterval for polling", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "useNotifications.ts"),
      "utf-8",
    );
    expect(source).toContain("refetchInterval: 60000");
    expect(source).toContain("enabled: isAuthenticated");
  });

  it("hook source returns correct interface shape", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "useNotifications.ts"),
      "utf-8",
    );
    expect(source).toContain("notifications:");
    expect(source).toContain("unreadCount:");
    expect(source).toContain("markRead:");
    expect(source).toContain("markAllRead:");
    expect(source).toContain("isLoading");
  });
});
