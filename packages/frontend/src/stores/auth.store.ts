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

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  token: localStorage.getItem("session_token"),
  isAuthenticated: false,
  isNewUser: false,

  setUser: (user, isNew = false) =>
    set({ user, isAuthenticated: true, isNewUser: isNew }),

  setToken: (token) => {
    localStorage.setItem("session_token", token);
    set({ token });
  },

  clearUser: () => {
    localStorage.removeItem("session_token");
    set({ user: null, token: null, isAuthenticated: false, isNewUser: false });
  },
}));
