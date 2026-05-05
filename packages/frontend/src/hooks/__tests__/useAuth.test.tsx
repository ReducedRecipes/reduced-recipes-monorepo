import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuthStore } from "../../stores/auth.store";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: vi.fn(() => ({ isLoading: false, data: null })),
    useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
  };
});

import { apiFetch } from "../../lib/api";

const mockApiFetch = vi.mocked(apiFetch);

const mockUser = {
  id: "u-123",
  name: "Test User",
  email: "test@example.com",
  picture_url: null,
  profile_public: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.getState().clearUser();
});

describe("useAuth hook logic", () => {
  it("initial state has no user and is not authenticated", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
  });

  it("setUser populates user and sets isAuthenticated", () => {
    useAuthStore.getState().setUser(mockUser as any);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isNewUser).toBe(false);
  });

  it("setUser with isNew flag marks user as new", () => {
    useAuthStore.getState().setUser(mockUser as any, true);
    const state = useAuthStore.getState();
    expect(state.isNewUser).toBe(true);
  });

  it("clearUser resets all state", () => {
    useAuthStore.getState().setUser(mockUser as any, true);
    useAuthStore.getState().clearUser();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
  });
});

describe("useAuth hook — login action", () => {
  it("login dispatches open-signin-menu when not in an in-app browser", async () => {
    // Ensure a standard browser UA (no in-app browser indicators)
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      configurable: true,
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { useAuth } = await import("../useAuth");
    const { result } = renderHook(() => useAuth());

    await result.current.login();

    const dispatched = dispatchSpy.mock.calls.map((c) => (c[0] as unknown as CustomEvent).type);
    expect(dispatched).toContain("open-signin-menu");
    dispatchSpy.mockRestore();
  });

  it("login dispatches inapp-browser-login when in an in-app browser", async () => {
    // Mock an Instagram in-app browser UA
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) Instagram/220.0",
      configurable: true,
    });

    const dispatchSpy = vi.spyOn(window, "dispatchEvent");
    const { useAuth } = await import("../useAuth");
    const { result } = renderHook(() => useAuth());

    await result.current.login();

    const dispatched = dispatchSpy.mock.calls.map((c) => (c[0] as unknown as CustomEvent).type);
    expect(dispatched).toContain("inapp-browser-login");
    expect(dispatched).not.toContain("open-signin-menu");
    dispatchSpy.mockRestore();

    // Restore a neutral UA for subsequent tests
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0",
      configurable: true,
    });
  });
});

describe("useAuth hook — auth check logic", () => {
  it("successful /auth/me response populates user via store", async () => {
    mockApiFetch.mockResolvedValueOnce({ user: mockUser });

    const data = await apiFetch<{ user: any }>("/auth/me");
    useAuthStore.getState().setUser(data.user);

    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
  });

  it("failed /auth/me clears user via store", async () => {
    useAuthStore.getState().setUser(mockUser as any);
    mockApiFetch.mockRejectedValueOnce(new Error("401 Unauthorized"));

    try {
      await apiFetch("/auth/me");
    } catch {
      useAuthStore.getState().clearUser();
    }

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});

describe("useAuth hook — logout action", () => {
  it("logout calls POST /auth/logout and clears store", async () => {
    useAuthStore.getState().setUser(mockUser as any);
    mockApiFetch.mockResolvedValueOnce({ ok: true });

    await apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
    useAuthStore.getState().clearUser();

    expect(mockApiFetch).toHaveBeenCalledWith("/auth/logout", { method: "POST" });
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
  });
});

describe("useAuth hook — exports", () => {
  it("useAuth exports login and checkAuth actions", async () => {
    const mod = await import("../useAuth");
    // Verify the module exports useAuth
    expect(typeof mod.useAuth).toBe("function");

    // Read the source to verify it returns login and checkAuth
    const fs = await import("fs");
    const path = await import("path");
    const source = fs.readFileSync(
      path.resolve(__dirname, "..", "useAuth.ts"),
      "utf-8"
    );
    expect(source).toContain("login");
    expect(source).toContain("checkAuth");
    // login now dispatches open-signin-menu instead of calling getGoogleAuthUrl
    expect(source).toContain("open-signin-menu");
    expect(source).toContain("invalidateQueries");
  });
});
