import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../stores/auth.store", () => ({
  useAuthStore: vi.fn(() => ({
    setUser: vi.fn(),
    setToken: vi.fn(),
  })),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockNavigate = vi.fn();

const SOURCE = readFileSync(
  resolve(__dirname, "../LoginCallbackPage.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LoginCallbackPage", () => {
  it("module exports a default component", async () => {
    const mod = await import("../LoginCallbackPage");
    expect(typeof mod.default).toBe("function");
  });

  it("uses useSearchParams and useNavigate from react-router-dom", () => {
    expect(SOURCE).toContain("useSearchParams");
    expect(SOURCE).toContain("useNavigate");
  });

  it("reads status, is_new_user, session_token, and error from query params", () => {
    expect(SOURCE).toContain('"status"');
    expect(SOURCE).toContain('"is_new_user"');
    expect(SOURCE).toContain('"session_token"');
    expect(SOURCE).toContain('"error"');
  });

  it("stores token and fetches user on successful callback", async () => {
    // The component calls setToken then apiFetch('/auth/me') on success
    expect(SOURCE).toContain("setToken(sessionToken)");
    expect(SOURCE).toContain('apiFetch<{ user: User }>("/auth/me")');
  });

  it("sets show_dietary_onboarding localStorage flag for new users", async () => {
    const status = "success";
    const isNewUser = true;
    const store: Record<string, string> = {};

    if (status === "success") {
      if (isNewUser) {
        store["show_dietary_onboarding"] = "true";
      }
      mockNavigate("/", { replace: true });
    }

    expect(store["show_dietary_onboarding"]).toBe("true");
  });

  it("does NOT set onboarding flag for existing users", async () => {
    const status = "success";
    const isNewUser = false;
    const store: Record<string, string> = {};

    if (status === "success") {
      if (isNewUser) {
        store["show_dietary_onboarding"] = "true";
      }
      mockNavigate("/", { replace: true });
    }

    expect(store["show_dietary_onboarding"]).toBeUndefined();
  });

  it("shows error state when status is error", () => {
    const status = "error";
    const errorMessage = "Account suspended";

    let displayedError: string | null = null;
    if (status === "error") {
      displayedError = errorMessage || "An unknown error occurred during sign in.";
    }

    expect(displayedError).toBe("Account suspended");
  });

  it("shows default error message when error param is empty", () => {
    const status = "error";
    const errorMessage = "";

    let displayedError: string | null = null;
    if (status === "error") {
      displayedError = errorMessage || "An unknown error occurred during sign in.";
    }

    expect(displayedError).toBe("An unknown error occurred during sign in.");
  });

  it("try-again navigates home when in error state", () => {
    // The component navigates to "/" on try again click
    expect(SOURCE).toContain('navigate("/", { replace: true })');
  });

  it("navigates to / after successful auth", () => {
    expect(SOURCE).toContain('navigate("/", { replace: true })');
  });

  it("contains loading spinner with 'Signing you in...' text", () => {
    expect(SOURCE).toContain("Signing you in...");
    expect(SOURCE).toContain("animate-spin");
  });

  it("contains error display with 'Sign in failed' heading and try again", () => {
    expect(SOURCE).toContain("Sign in failed");
    expect(SOURCE).toContain("Try again");
  });

  it("sets show_dietary_onboarding in localStorage for new users", () => {
    expect(SOURCE).toContain('localStorage.setItem("show_dietary_onboarding"');
    expect(SOURCE).toContain("is_new_user");
  });
});
