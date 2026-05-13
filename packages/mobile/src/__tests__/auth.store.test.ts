import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("expo-secure-store", () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    getItemAsync: vi.fn(async (key: string) => store.get(key) ?? null),
    deleteItemAsync: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    __store: store,
  };
});

import { useAuthStore } from "../stores/auth.store";
import * as SecureStore from "expo-secure-store";
import type { User } from "@rr/shared";

const mockUser: User = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  picture_url: null,
  profile_public: 1,
  tier: "free",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      sessionToken: null,
      isAuthenticated: false,
      isNewUser: false,
    });
    (SecureStore as unknown as { __store: Map<string, string> }).__store.clear();
    vi.clearAllMocks();
  });

  it("setSession stores token and sets user", () => {
    useAuthStore.getState().setSession("tok-123", mockUser);

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBe("tok-123");
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isNewUser).toBe(false);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith("session_token", "tok-123");
  });

  it("setSession with isNew=true sets isNewUser", () => {
    useAuthStore.getState().setSession("tok-456", mockUser, true);

    const state = useAuthStore.getState();
    expect(state.isNewUser).toBe(true);
    expect(state.isAuthenticated).toBe(true);
  });

  it("clearSession removes token and resets state", () => {
    useAuthStore.getState().setSession("tok-789", mockUser);
    useAuthStore.getState().clearSession();

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBeNull();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith("session_token");
  });

  it("hydrateFromStorage restores token and marks user as authenticated", async () => {
    (SecureStore as unknown as { __store: Map<string, string> }).__store.set(
      "session_token",
      "tok-hydrated",
    );

    await useAuthStore.getState().hydrateFromStorage();

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBe("tok-hydrated");
    // user stays null until a /users/me call repopulates it; that's OK because
    // API calls only read sessionToken and UI gates only check isAuthenticated.
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(true);
  });

  it("hydrateFromStorage does nothing when no token stored", async () => {
    await useAuthStore.getState().hydrateFromStorage();

    const state = useAuthStore.getState();
    expect(state.sessionToken).toBeNull();
  });
});
