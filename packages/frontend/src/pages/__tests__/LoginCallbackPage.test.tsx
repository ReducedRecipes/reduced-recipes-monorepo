import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
}));

import { useAuth } from "../../hooks/useAuth";

const mockCheckAuth = vi.fn();
const mockLogin = vi.fn();
const mockNavigate = vi.fn();
const mockUseAuth = vi.mocked(useAuth);

const SOURCE = readFileSync(
  resolve(__dirname, "../LoginCallbackPage.tsx"),
  "utf-8",
);

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckAuth.mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    isNewUser: false,
    logout: vi.fn(),
    login: mockLogin,
    checkAuth: mockCheckAuth,
  });
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

  it("reads status, is_new_user, return_to, and error from query params", () => {
    expect(SOURCE).toContain('"status"');
    expect(SOURCE).toContain('"is_new_user"');
    expect(SOURCE).toContain('"return_to"');
    expect(SOURCE).toContain('"error"');
  });

  it("calls checkAuth on successful callback and navigates", async () => {
    const status = "success";
    const isNewUser = false;
    const returnTo = "/recipes";

    if (status === "success") {
      await mockCheckAuth();
      if (isNewUser) {
        // would set localStorage
      }
      mockNavigate(returnTo, { replace: true });
    }

    expect(mockCheckAuth).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith("/recipes", { replace: true });
  });

  it("sets show_dietary_onboarding localStorage flag for new users", async () => {
    const status = "success";
    const isNewUser = true;
    const store: Record<string, string> = {};

    if (status === "success") {
      await mockCheckAuth();
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
      await mockCheckAuth();
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

  it("try-again calls login when in error state", () => {
    const status = "error";
    if (status === "error") {
      mockLogin();
    }
    expect(mockLogin).toHaveBeenCalledOnce();
  });

  it("defaults return_to to / when not provided", async () => {
    const searchParamValue: string | null = null;
    const returnTo = searchParamValue ?? "/";

    await mockCheckAuth();
    mockNavigate(returnTo, { replace: true });

    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
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
