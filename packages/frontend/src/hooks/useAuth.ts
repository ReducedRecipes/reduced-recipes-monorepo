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

  const login = async (returnTo?: string) => {
    const { url } = await getGoogleAuthUrl("web", returnTo);
    window.location.href = url;
  };

  const checkAuth = async () => {
    await queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
  };

  return { user, isAuthenticated, isLoading, isNewUser, logout, login, checkAuth };
}
