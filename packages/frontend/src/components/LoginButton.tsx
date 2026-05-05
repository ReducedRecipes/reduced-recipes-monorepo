import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { isInAppBrowser } from "../lib/in-app-browser";

function SignInMenu({
  className,
  onSignedIn,
}: {
  className?: string;
  onSignedIn: (token: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOpenMenu() {
      setOpen(true);
    }
    window.addEventListener('open-signin-menu', onOpenMenu);
    return () => window.removeEventListener('open-signin-menu', onOpenMenu);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleProvider = async (p: 'google' | 'apple') => {
    setError(null);
    setBusy(p);
    try {
      const { signInWithFirebaseProvider } = await import('../lib/auth-firebase');
      const { token } = await signInWithFirebaseProvider(p);
      onSignedIn(token);
    } catch (err) {
      const msg = (err as Error).message ?? 'Sign-in failed';
      // Suppress cancellation noise; the user knows they cancelled.
      if (!/cancel/i.test(msg) && !/redirect sign-in initiated/i.test(msg)) {
        setError(msg);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div ref={ref} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => {
          if (isInAppBrowser()) {
            window.dispatchEvent(new CustomEvent('inapp-browser-login'));
            return;
          }
          setOpen((v) => !v);
        }}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
      >
        Sign in
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-64 rounded-lg border border-gray-200 bg-white p-2 shadow-lg z-10">
          <button
            disabled={busy !== null}
            onClick={() => handleProvider('apple')}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:opacity-50"
          >
            <span>Sign in with Apple</span>
          </button>
          <button
            disabled={busy !== null}
            onClick={() => handleProvider('google')}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <span>Sign in with Google</span>
          </button>
          {error && <p className="mt-2 px-1 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

export function LoginButton({ className = "" }: { className?: string }) {
  const { user, isLoading, isAuthenticated, logout } = useAuth();
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
                Open in your browser
              </div>
              <p style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.6, marginBottom: 16 }}>
                Google Sign-In doesn&rsquo;t work in in-app browsers.
              </p>
              <div style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 20 }}>
                <div style={{ marginBottom: 8 }}>
                  <strong style={{ color: "var(--ink)" }}>iOS:</strong> Tap the <span className="mono" style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--rule-2)" }}>···</span> or <span className="mono" style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--rule-2)" }}>↗</span> menu, then &ldquo;Open in Safari&rdquo;
                </div>
                <div>
                  <strong style={{ color: "var(--ink)" }}>Android:</strong> Tap the <span className="mono" style={{ fontSize: 11, padding: "2px 6px", border: "1px solid var(--rule-2)" }}>⋮</span> menu, then &ldquo;Open in Chrome&rdquo;
                </div>
              </div>
              <button
                onClick={() => setShowInAppWarning(false)}
                className="mono"
                style={{
                  fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em",
                  padding: "10px 16px", background: "var(--ink)", color: "var(--bg)",
                  border: "1px solid var(--ink)",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <SignInMenu
        className={className}
        onSignedIn={(token) => {
          localStorage.setItem('session_token', token);
          // Force the useAuth /auth/me query to re-run and pick up the new session.
          window.location.reload();
        }}
      />
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
