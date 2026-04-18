import { useFollow } from "../hooks/useFollow";
import { useAuth } from "../hooks/useAuth";

interface FollowButtonProps {
  userId: string;
  className?: string;
}

export function FollowButton({ userId, className = "" }: FollowButtonProps) {
  const { isFollowing, isOwnProfile, toggleFollow, isMutating } =
    useFollow(userId);
  const { isAuthenticated, login } = useAuth();

  if (isOwnProfile) return null;

  const handleClick = () => {
    if (!isAuthenticated) {
      login();
      return;
    }
    toggleFollow();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isMutating}
      className={`inline-flex items-center justify-center rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
        isFollowing
          ? "border border-gray-300 bg-white text-gray-700 hover:border-red-300 hover:text-red-600"
          : "bg-orange-500 text-white hover:bg-orange-600"
      } disabled:opacity-50 ${className}`}
      aria-label={isFollowing ? "Unfollow" : "Follow"}
    >
      {isMutating ? "…" : isFollowing ? "Following" : "Follow"}
    </button>
  );
}
