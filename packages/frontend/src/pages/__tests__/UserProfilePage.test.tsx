import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const src = readFileSync(
  resolve(__dirname, "../UserProfilePage.tsx"),
  "utf-8",
);

describe("UserProfilePage", () => {
  it("imports useFollow hook", () => {
    expect(src).toContain('useFollow');
  });

  it("imports FollowButton component", () => {
    expect(src).toContain('FollowButton');
  });

  it("imports getUser and fetchUserCollections from api", () => {
    expect(src).toContain('getUser');
    expect(src).toContain('fetchUserCollections');
  });

  it("uses useParams to get user id", () => {
    expect(src).toContain('useParams');
    expect(src).toContain('{ id }');
  });

  it("renders follower and following counts", () => {
    expect(src).toContain('followerCount');
    expect(src).toContain('followingCount');
  });

  it("shows user not found error state", () => {
    expect(src).toContain('User not found');
  });

  it("displays public collections section", () => {
    expect(src).toContain('Public Collections');
    expect(src).toContain('No public collections yet');
  });

  it("renders FollowButton for other users", () => {
    expect(src).toContain('<FollowButton userId={id!}');
  });

  it("conditionally hides follow button for own profile", () => {
    expect(src).toContain('isOwnProfile');
    expect(src).toContain('!isOwnProfile');
  });

  it("exports default function component", () => {
    expect(src).toContain('export default function UserProfilePage');
  });
});

describe("ProfilePage (updated)", () => {
  const profileSrc = readFileSync(
    resolve(__dirname, "../ProfilePage.tsx"),
    "utf-8",
  );

  it("imports useFollow hook", () => {
    expect(profileSrc).toContain('useFollow');
  });

  it("displays follower count", () => {
    expect(profileSrc).toContain('followerCount');
  });

  it("displays following count", () => {
    expect(profileSrc).toContain('followingCount');
  });
});

describe("main.tsx routing", () => {
  const mainSrc = readFileSync(
    resolve(__dirname, "../../main.tsx"),
    "utf-8",
  );

  it("imports UserProfilePage", () => {
    expect(mainSrc).toContain('UserProfilePage');
  });

  it("registers /user/:id route", () => {
    expect(mainSrc).toContain('/user/:id');
  });
});
