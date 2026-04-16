import { create } from "zustand";
import type { User } from "@rr/shared";

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isNewUser: boolean;

  setUser: (user: User, isNew?: boolean) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  isAuthenticated: false,
  isNewUser: false,

  setUser: (user, isNew = false) =>
    set({ user, isAuthenticated: true, isNewUser: isNew }),

  clearUser: () =>
    set({ user: null, isAuthenticated: false, isNewUser: false }),
}));
