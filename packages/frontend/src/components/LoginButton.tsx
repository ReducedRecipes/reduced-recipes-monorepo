import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function LoginButton({ className = "" }: { className?: string }) {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [showInAppWarning, setShowInAppWarning] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = () => setShowInAppWarning(true);
    window.addEventListener("inapp-browser-login", handler);
    return () => window.removeEventListener("inapp-browser-login", handler);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (isLoading) {
    return (
      <div className={`h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-green-600 ${className}`} />
    );
  }

  if (!isAuthenticated || !user) {
    if (showInAppWarning) {
      return (
        <div className={className} style={{ position: "relative" }}>
          <div style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 999,
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }} onClick={() => setShowInAppWarning(false)}>
            <div style={{
              background: "var(--bg)", border: "1px solid var(--rule-2)", padding: 28,
              maxWidth: 360, width: "100%",
            }} onClick={(e) => e.stopPropagation()}>
              <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 12 }}>
                Open in browser
              </div>
              <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.6, marginBottom: 16 }}>
                Google Sign-In doesn&rsquo;t work in in-app browsers.
                Please open this page in Safari or Chrome to sign in.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => {
                    // Try to open in system browser
                    window.open(window.location.href, "_system");
                  }}
                  className="mono"
                  style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em",
                    padding: "10px 16px", background: "var(--ink)", color: "var(--bg)",
                    border: "1px solid var(--ink)",
                  }}
                >
                  Open in browser
                </button>
                <button
                  onClick={() => setShowInAppWarning(false)}
                  className="mono"
                  style={{
                    fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em",
                    padding: "10px 16px", border: "1px solid var(--rule-2)",
                    color: "var(--ink-3)",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <button
        onClick={() => login()}
        className={`rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 ${className}`}
      >
        Sign in
      </button>
    );
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .filter((w) => w.length > 0)
        .map((w) => w.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user.email.charAt(0).toUpperCase();

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg p-1 hover:bg-gray-100"
      >
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt={user.name}
            className="h-8 w-8 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-xs font-bold text-white">
            {initials}
          </div>
        )}
        <span className="hidden text-sm font-medium text-gray-700 sm:inline">
          {user.name}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Profile
          </Link>
          <Link
            to="/saved"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Saved Recipes
          </Link>
          <Link
            to="/shopping-lists"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Shopping Lists
          </Link>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Settings
          </Link>
          <button
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
