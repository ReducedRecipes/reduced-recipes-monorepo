import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/auth.store";
import { apiFetch } from "../lib/api";
import type { User } from "@rr/shared";

export default function LoginCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setUser, setToken } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  const status = searchParams.get("status");
  const isNewUser = searchParams.get("is_new_user") === "true";
  const sessionToken = searchParams.get("session_token");
  const errorMessage = searchParams.get("error");

  useEffect(() => {
    if (status === "error") {
      setError(errorMessage || "An unknown error occurred during sign in.");
      return;
    }

    if (status === "success" && sessionToken) {
      (async () => {
        try {
          // Store token first so apiFetch can use it
          setToken(sessionToken);

          // Fetch user profile with the new token
          const data = await apiFetch<{ user: User }>("/auth/me");
          setUser(data.user, isNewUser);

          if (isNewUser) {
            localStorage.setItem("show_dietary_onboarding", "true");
          }
          navigate("/", { replace: true });
        } catch {
          setError("Failed to verify authentication. Please try again.");
        }
      })();
    }
  }, [status, isNewUser, sessionToken, errorMessage, setUser, setToken, navigate]);

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="text-red-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Sign in failed</h2>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => navigate("/", { replace: true })}
            className="bg-green-600 text-white rounded-lg px-6 py-2 hover:bg-green-700 transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-4 border-green-500 border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-600">Signing you in...</p>
      </div>
    </div>
  );
}
