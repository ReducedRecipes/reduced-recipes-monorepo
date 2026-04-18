import { create } from "zustand";
import type { User } from "@rr/shared";
import { storeToken, getToken, deleteToken } from "../lib/auth";

interface AuthState {
  user: User | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  isNewUser: boolean;

  setSession: (token: string, user: User, isNew?: boolean) => void;
  clearSession: () => void;
  hydrateFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  sessionToken: null,
  isAuthenticated: false,
  isNewUser: false,

  setSession: (token: string, user: User, isNew?: boolean) => {
    storeToken(token);
    set({
      sessionToken: token,
      user,
      isAuthenticated: true,
      isNewUser: isNew ?? false,
    });
  },

  clearSession: () => {
    deleteToken();
    set({
      sessionToken: null,
      user: null,
      isAuthenticated: false,
      isNewUser: false,
    });
  },

  hydrateFromStorage: async () => {
    const token = await getToken();
    if (token) {
      set({ sessionToken: token });
    }
  },
}));
