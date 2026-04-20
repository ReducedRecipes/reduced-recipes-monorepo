import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNotifications } from "../hooks/useNotifications";
import type { Notification } from "@rr/shared";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNotification(n: Notification): string {
  try {
    const data = typeof n.payload === "string" ? JSON.parse(n.payload) : n.payload;
    switch (n.type) {
      case "new_follower":
        return `${data.follower_name || "Someone"} started following you`;
      case "shared_list_update":
        return `${data.user_name || "Someone"} updated a shared list`;
      case "review_reply":
        return `${data.user_name || "Someone"} replied to your review`;
      case "flagged_review_outcome":
        return "Your flagged review has been reviewed";
      default:
        return n.type.replace(/_/g, " ");
    }
  } catch {
    return n.type.replace(/_/g, " ");
  }
}

export default function NotificationBell({ className }: { className?: string }) {
  const { isAuthenticated } = useAuth();
  const { notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  if (!isAuthenticated) return null;

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-1.5 text-gray-600 hover:text-orange-600"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-20"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-30 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2">
              <span className="text-sm font-semibold text-gray-800">Notifications</span>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={() => markAllRead()}
                  className="text-xs text-orange-600 hover:underline"
                >
                  Mark all read
                </button>
              )}
            </div>
            <ul className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <li className="px-4 py-6 text-center text-sm text-gray-400">
                  No notifications
                </li>
              ) : (
                notifications.map((n: Notification) => (
                  <li
                    key={n.id}
                    className={`border-b border-gray-50 px-4 py-3 ${n.read ? "bg-white" : "bg-orange-50"}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">
                          {formatNotification(n)}
                        </p>
                        {typeof n.payload === "string" && (() => {
                          try { JSON.parse(n.payload); return null; } catch {
                            return <p className="mt-0.5 text-xs text-gray-600">{n.payload}</p>;
                          }
                        })()}
                        <p className="mt-0.5 text-[10px] text-gray-400">
                          {timeAgo(n.created_at)}
                        </p>
                      </div>
                      {!n.read && (
                        <button
                          type="button"
                          onClick={() => markRead(n.id)}
                          className="shrink-0 text-xs text-orange-600 hover:underline"
                        >
                          Read
                        </button>
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
