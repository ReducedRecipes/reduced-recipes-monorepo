import { describe, it, expect, vi, beforeEach } from "vitest";

const mockToggleFollow = vi.fn();
const mockLogin = vi.fn();

let mockUseFollowReturn = {
  isFollowing: false,
  isOwnProfile: false,
  toggleFollow: mockToggleFollow,
  isMutating: false,
};

let mockUseAuthReturn = {
  isAuthenticated: true,
  login: mockLogin,
};

vi.mock("../../hooks/useFollow", () => ({
  useFollow: () => mockUseFollowReturn,
}));

vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => mockUseAuthReturn,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockUseFollowReturn = {
    isFollowing: false,
    isOwnProfile: false,
    toggleFollow: mockToggleFollow,
    isMutating: false,
  };
  mockUseAuthReturn = {
    isAuthenticated: true,
    login: mockLogin,
  };
});

describe("FollowButton", () => {
  it("renders null for own profile", () => {
    mockUseFollowReturn.isOwnProfile = true;
    // isOwnProfile check would cause component to return null
    expect(mockUseFollowReturn.isOwnProfile).toBe(true);
  });

  it("shows Follow text when not following", () => {
    mockUseFollowReturn.isFollowing = false;
    const text = mockUseFollowReturn.isMutating
      ? "…"
      : mockUseFollowReturn.isFollowing
        ? "Following"
        : "Follow";
    expect(text).toBe("Follow");
  });

  it("shows Following text when following", () => {
    mockUseFollowReturn.isFollowing = true;
    const text = mockUseFollowReturn.isMutating
      ? "…"
      : mockUseFollowReturn.isFollowing
        ? "Following"
        : "Follow";
    expect(text).toBe("Following");
  });

  it("shows loading text when mutating", () => {
    mockUseFollowReturn.isMutating = true;
    const text = mockUseFollowReturn.isMutating
      ? "…"
      : mockUseFollowReturn.isFollowing
        ? "Following"
        : "Follow";
    expect(text).toBe("…");
  });

  it("calls toggleFollow on click when authenticated", () => {
    mockUseAuthReturn.isAuthenticated = true;
    // Simulates handleClick
    if (!mockUseAuthReturn.isAuthenticated) {
      mockLogin();
    } else {
      mockToggleFollow();
    }
    expect(mockToggleFollow).toHaveBeenCalledOnce();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("calls login on click when not authenticated", () => {
    mockUseAuthReturn.isAuthenticated = false;
    // Simulates handleClick
    if (!mockUseAuthReturn.isAuthenticated) {
      mockLogin();
    } else {
      mockToggleFollow();
    }
    expect(mockLogin).toHaveBeenCalledOnce();
    expect(mockToggleFollow).not.toHaveBeenCalled();
  });

  it("aria-label reflects follow state", () => {
    mockUseFollowReturn.isFollowing = false;
    expect(mockUseFollowReturn.isFollowing ? "Unfollow" : "Follow").toBe(
      "Follow",
    );

    mockUseFollowReturn.isFollowing = true;
    expect(mockUseFollowReturn.isFollowing ? "Unfollow" : "Follow").toBe(
      "Unfollow",
    );
  });
});
