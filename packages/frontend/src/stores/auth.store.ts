import { create } from "zustand";
import type { User } from "@rr/shared";

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isNewUser: boolean;

  setUser: (user: User, isNew?: boolean) => void;
  setToken: (token: string) => void;
  clearUser: () => void;
}

function safeLocalStorage() {
  try {
    // Verify localStorage is fully functional (may not be in test environments)
    if (typeof localStorage !== "undefined" && typeof localStorage.getItem === "function") {
      return localStorage;
    }
  } catch {
    // ignore
  }
  return null;
}

function getStoredToken(): string | null {
  return safeLocalStorage()?.getItem("session_token") ?? null;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: getStoredToken(),
  isAuthenticated: false,
  isNewUser: false,

  setUser: (user, isNew = false) =>
    set({ user, isAuthenticated: true, isNewUser: isNew }),

  setToken: (token) => {
    safeLocalStorage()?.setItem("session_token", token);
    set({ token });
  },

  clearUser: () => {
    safeLocalStorage()?.removeItem("session_token");
    set({ user: null, token: null, isAuthenticated: false, isNewUser: false });
  },
}));
