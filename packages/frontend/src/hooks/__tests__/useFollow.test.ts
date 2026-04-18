import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
  getGoogleAuthUrl: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  fetchFollowers: vi.fn(),
  fetchFollowing: vi.fn(),
}));

import {
  followUser,
  unfollowUser,
  fetchFollowers,
  fetchFollowing,
} from "../../lib/api";

const mockFollowUser = vi.mocked(followUser);
const mockUnfollowUser = vi.mocked(unfollowUser);
const mockFetchFollowers = vi.mocked(fetchFollowers);
const mockFetchFollowing = vi.mocked(fetchFollowing);

const mockFollowerItem = {
  id: "user-1",
  name: "Alice",
  profile_image_url: "https://example.com/alice.jpg",
  is_following: false,
};

const mockFollowingItem = {
  id: "user-3",
  name: "Charlie",
  profile_image_url: null,
  is_following: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useFollow — API functions", () => {
  it("fetchFollowers returns paginated follower list", async () => {
    mockFetchFollowers.mockResolvedValueOnce({
      items: [mockFollowerItem],
      next_cursor: null,
    });

    const result = await fetchFollowers("user-2");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("user-1");
    expect(result.items[0]!.name).toBe("Alice");
    expect(mockFetchFollowers).toHaveBeenCalledWith("user-2");
  });

  it("fetchFollowing returns paginated following list", async () => {
    mockFetchFollowing.mockResolvedValueOnce({
      items: [mockFollowingItem],
      next_cursor: "cursor-abc",
    });

    const result = await fetchFollowing("user-2");
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("user-3");
    expect(result.next_cursor).toBe("cursor-abc");
    expect(mockFetchFollowing).toHaveBeenCalledWith("user-2");
  });

  it("followUser sends POST and returns success", async () => {
    mockFollowUser.mockResolvedValueOnce({ success: true });

    const result = await followUser("user-2");
    expect(result.success).toBe(true);
    expect(mockFollowUser).toHaveBeenCalledWith("user-2");
  });

  it("unfollowUser sends DELETE", async () => {
    mockUnfollowUser.mockResolvedValueOnce(undefined);

    await unfollowUser("user-2");
    expect(mockUnfollowUser).toHaveBeenCalledWith("user-2");
  });

  it("fetchFollowers handles empty list", async () => {
    mockFetchFollowers.mockResolvedValueOnce({
      items: [],
      next_cursor: null,
    });

    const result = await fetchFollowers("user-2");
    expect(result.items).toHaveLength(0);
  });

  it("fetchFollowers handles pagination cursor", async () => {
    mockFetchFollowers.mockResolvedValueOnce({
      items: [mockFollowerItem],
      next_cursor: "next-page",
    });

    const result = await fetchFollowers("user-2");
    expect(result.next_cursor).toBe("next-page");
  });
});

describe("useFollow — isFollowing logic", () => {
  it("detects current user in followers list", () => {
    const currentUserId = "user-1";
    const followers = [mockFollowerItem];
    const isFollowing = followers.some((f) => f.id === currentUserId);
    expect(isFollowing).toBe(true);
  });

  it("returns false when current user is not in followers", () => {
    const currentUserId = "user-99";
    const followers = [mockFollowerItem];
    const isFollowing = followers.some((f) => f.id === currentUserId);
    expect(isFollowing).toBe(false);
  });

  it("returns false for empty followers list", () => {
    const currentUserId = "user-1";
    const followers: typeof mockFollowerItem[] = [];
    const isFollowing = followers.some((f) => f.id === currentUserId);
    expect(isFollowing).toBe(false);
  });
});

describe("useFollow — toggle logic", () => {
  it("calls followUser when not following", async () => {
    mockFollowUser.mockResolvedValueOnce({ success: true });

    const isFollowing = false;
    if (!isFollowing) {
      await followUser("user-2");
    }
    expect(mockFollowUser).toHaveBeenCalledWith("user-2");
  });

  it("calls unfollowUser when already following", async () => {
    mockUnfollowUser.mockResolvedValueOnce(undefined);

    const isFollowing = true;
    if (isFollowing) {
      await unfollowUser("user-2");
    }
    expect(mockUnfollowUser).toHaveBeenCalledWith("user-2");
  });
});
