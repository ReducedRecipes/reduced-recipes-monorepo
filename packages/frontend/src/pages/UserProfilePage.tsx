import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getUser, fetchUserCollections } from "../lib/api";
import { useFollow } from "../hooks/useFollow";
import { useAuth } from "../hooks/useAuth";
import { FollowButton } from "../components/FollowButton";
import type { Collection } from "@rr/shared";

export default function UserProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { user: currentUser } = useAuth();
  const isOwnProfile = currentUser?.id === id;

  const userQuery = useQuery({
    queryKey: ["user", id],
    queryFn: () => getUser(id!),
    enabled: !!id,
  });

  const collectionsQuery = useQuery({
    queryKey: ["userCollections", id],
    queryFn: () => fetchUserCollections(id!),
    enabled: !!id,
  });

  const { followerCount, followingCount, isLoading: followLoading } =
    useFollow(id ?? "");

  if (userQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (userQuery.isError || !userQuery.data) {
    return (
      <div className="mx-auto max-w-2xl py-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">User not found</h1>
        <p className="mt-2 text-gray-500">
          This user doesn't exist or their profile is private.
        </p>
        <Link to="/" className="mt-4 inline-block text-orange-600 hover:text-orange-700">
          Back to home
        </Link>
      </div>
    );
  }

  const profile = userQuery.data;
  const collections: Collection[] = collectionsQuery.data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl py-8">
      {/* User info header */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4">
          {profile.picture_url ? (
            <img
              src={profile.picture_url}
              alt={profile.name}
              className="h-20 w-20 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-orange-600 text-2xl font-bold text-white">
              {(profile.name ?? profile.email ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-gray-900">
                {profile.name}
              </h1>
              {!isOwnProfile && <FollowButton userId={id!} />}
            </div>

            {/* Follower/following counts */}
            <div className="mt-2 flex gap-4 text-sm text-gray-600">
              {followLoading ? (
                <span className="text-gray-400">Loading…</span>
              ) : (
                <>
                  <span>
                    <span className="font-semibold text-gray-900">
                      {followerCount}
                    </span>{" "}
                    {followerCount === 1 ? "follower" : "followers"}
                  </span>
                  <span>
                    <span className="font-semibold text-gray-900">
                      {followingCount}
                    </span>{" "}
                    following
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Public collections */}
      <div className="mt-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Public Collections
        </h2>
        {collectionsQuery.isLoading ? (
          <div className="animate-pulse space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-gray-200" />
            ))}
          </div>
        ) : collections.length === 0 ? (
          <p className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-center text-sm text-gray-500">
            No public collections yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {collections.map((collection) => (
              <li
                key={collection.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3"
              >
                <span className="font-medium text-gray-900">
                  {collection.name}
                </span>
                {collection.is_public === 1 && (
                  <span className="text-xs text-gray-400">Public</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
