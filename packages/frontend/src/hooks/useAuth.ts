import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "../stores/auth.store";
import { apiFetch, getGoogleAuthUrl } from "../lib/api";
import type { User } from "@rr/shared";

export function useAuth() {
  const { user, isAuthenticated, isNewUser, setUser, clearUser } =
    useAuthStore();
  const queryClient = useQueryClient();

  const { isLoading } = useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const token = localStorage.getItem("session_token");
      if (!token) return null;
      try {
        const data = await apiFetch<{ user: User }>("/auth/me");
        setUser(data.user);
        return data;
      } catch {
        clearUser();
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const logout = async () => {
    await apiFetch<{ ok: true }>("/auth/logout", { method: "POST" });
    clearUser();
    queryClient.invalidateQueries({ queryKey: ["auth"] });
  };

  const isInAppBrowser = (): boolean => {
    const ua = navigator.userAgent || "";
    return /FBAN|FBAV|Instagram|Twitter|Line\/|Snapchat|Pinterest|LinkedIn|TikTok|ProductHunt/i.test(ua)
      || (!/Safari/i.test(ua) && /AppleWebKit/i.test(ua) && /Mobile/i.test(ua));
  };

  const login = async (returnTo?: string) => {
    if (isInAppBrowser()) {
      // Signal to UI that in-app browser was detected
      window.dispatchEvent(new CustomEvent("inapp-browser-login"));
      return;
    }
    const destination = returnTo ?? `${window.location.origin}/auth/callback`;
    const { url } = await getGoogleAuthUrl("web", destination);
    window.location.href = url;
  };

  const checkAuth = async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  return { user, isAuthenticated, isLoading, isNewUser, logout, login, checkAuth };
}
