import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../../hooks/useAuth";

const mockUseAuth = vi.mocked(useAuth);

function renderButton() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LoginButton />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Must import after mocking
import { LoginButton } from "../LoginButton";

const mockLogin = vi.fn();
const mockLogout = vi.fn();

const baseAuth = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  isNewUser: false,
  login: mockLogin,
  logout: mockLogout,
  checkAuth: vi.fn(),
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("LoginButton", () => {
  it("renders a loading spinner when isLoading is true", () => {
    mockUseAuth.mockReturnValue({ ...baseAuth, isLoading: true });
    const { container } = renderButton();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("renders Sign in button when unauthenticated", () => {
    mockUseAuth.mockReturnValue(baseAuth);
    renderButton();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  });

  it("opens provider dropdown when Sign in is clicked", () => {
    mockUseAuth.mockReturnValue(baseAuth);
    renderButton();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    // Clicking Sign in now opens the provider menu rather than calling login() directly
    expect(screen.getByText("Sign in with Apple")).toBeTruthy();
    expect(screen.getByText("Sign in with Google")).toBeTruthy();
  });

  it("renders user name and avatar when authenticated", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      isAuthenticated: true,
      user: {
        id: "u-1",
        name: "Jane Doe",
        email: "jane@example.com",
        picture_url: "https://example.com/avatar.jpg",
        profile_public: 1,
        tier: "free",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    });
    renderButton();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByAltText("Jane Doe")).toBeTruthy();
  });

  it("renders initials fallback when no picture_url", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      isAuthenticated: true,
      user: {
        id: "u-1",
        name: "Jane Doe",
        email: "jane@example.com",
        picture_url: null,
        profile_public: 1,
        tier: "free",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    });
    renderButton();
    expect(screen.getByText("JD")).toBeTruthy();
  });

  it("shows dropdown with Profile, Settings, Sign out on click", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      isAuthenticated: true,
      user: {
        id: "u-1",
        name: "Jane",
        email: "j@e.com",
        picture_url: null,
        profile_public: 1,
        tier: "free",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    });
    renderButton();
    fireEvent.click(screen.getByText("Jane"));
    expect(screen.getByText("Profile")).toBeTruthy();
    expect(screen.getByText("Settings")).toBeTruthy();
    expect(screen.getByText("Sign out")).toBeTruthy();
  });

  it("calls logout when Sign out is clicked", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      isAuthenticated: true,
      user: {
        id: "u-1",
        name: "Jane",
        email: "j@e.com",
        picture_url: null,
        profile_public: 1,
        tier: "free",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    });
    renderButton();
    fireEvent.click(screen.getByText("Jane"));
    fireEvent.click(screen.getByText("Sign out"));
    expect(mockLogout).toHaveBeenCalled();
  });

  it("dropdown links point to correct routes", () => {
    mockUseAuth.mockReturnValue({
      ...baseAuth,
      isAuthenticated: true,
      user: {
        id: "u-1",
        name: "Jane",
        email: "j@e.com",
        picture_url: null,
        profile_public: 1,
        tier: "free",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },
    });
    renderButton();
    fireEvent.click(screen.getByText("Jane"));
    expect(screen.getByText("Profile").closest("a")?.getAttribute("href")).toBe("/profile");
    expect(screen.getByText("Settings").closest("a")?.getAttribute("href")).toBe("/settings");
  });
});
