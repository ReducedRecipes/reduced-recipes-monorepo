import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "../stores/auth.store";
import type { User } from "@rr/shared";

const mockUser: User = {
  id: "user-1",
  email: "test@example.com",
  name: "Test User",
  picture_url: "https://example.com/pic.jpg",
  profile_public: 1,
  tier: "free",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("useAuthStore", () => {
  beforeEach(() => {
    useAuthStore.getState().clearUser();
  });

  it("has correct initial state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
  });

  it("setUser sets user and isAuthenticated=true", () => {
    useAuthStore.getState().setUser(mockUser);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isNewUser).toBe(false);
  });

  it("setUser with isNew=true sets isNewUser=true", () => {
    useAuthStore.getState().setUser(mockUser, true);
    const state = useAuthStore.getState();
    expect(state.user).toEqual(mockUser);
    expect(state.isAuthenticated).toBe(true);
    expect(state.isNewUser).toBe(true);
  });

  it("clearUser resets all state", () => {
    useAuthStore.getState().setUser(mockUser, true);
    useAuthStore.getState().clearUser();
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isNewUser).toBe(false);
  });
});
