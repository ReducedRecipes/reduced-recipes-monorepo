import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  followUser,
  unfollowUser,
  fetchFollowers,
  fetchFollowing,
} from "../lib/api";
import type { FollowListResponse } from "../lib/api";
import { useAuth } from "./useAuth";

export function useFollow(userId: string) {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const isOwnProfile = user?.id === userId;

  const followersQuery = useQuery({
    queryKey: ["followers", userId],
    queryFn: () => fetchFollowers(userId),
    staleTime: 60 * 1000,
  });

  const followingQuery = useQuery({
    queryKey: ["following", userId],
    queryFn: () => fetchFollowing(userId),
    staleTime: 60 * 1000,
  });

  const followers = followersQuery.data?.items ?? [];
  const following = followingQuery.data?.items ?? [];
  const followerCount = followers.length;
  const followingCount = following.length;

  const isFollowing = isAuthenticated
    ? followers.some((f) => f.id === user?.id)
    : false;

  const followMutation = useMutation({
    mutationFn: () => followUser(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["followers", userId] });
      const previous = queryClient.getQueryData<FollowListResponse>([
        "followers",
        userId,
      ]);
      queryClient.setQueryData<FollowListResponse>(
        ["followers", userId],
        (old) => ({
          items: [
            ...(old?.items ?? []),
            {
              id: user!.id,
              name: user!.name,
              profile_image_url: user!.picture_url,
              is_following: true,
            },
          ],
          next_cursor: old?.next_cursor ?? null,
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["followers", userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["followers", userId] });
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => unfollowUser(userId),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["followers", userId] });
      const previous = queryClient.getQueryData<FollowListResponse>([
        "followers",
        userId,
      ]);
      queryClient.setQueryData<FollowListResponse>(
        ["followers", userId],
        (old) => ({
          items: (old?.items ?? []).filter((f) => f.id !== user?.id),
          next_cursor: old?.next_cursor ?? null,
        }),
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(["followers", userId], context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["followers", userId] });
    },
  });

  const toggleFollow = () => {
    if (isFollowing) {
      unfollowMutation.mutate();
    } else {
      followMutation.mutate();
    }
  };

  return {
    isFollowing,
    isOwnProfile,
    followerCount,
    followingCount,
    followers,
    following,
    toggleFollow,
    isLoading: followersQuery.isLoading || followingQuery.isLoading,
    isMutating: followMutation.isPending || unfollowMutation.isPending,
  };
}
