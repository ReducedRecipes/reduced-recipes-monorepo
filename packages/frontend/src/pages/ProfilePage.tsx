import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Profile</h1>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          {user.picture_url ? (
            <img
              src={user.picture_url}
              alt={user.name}
              className="h-16 w-16 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-600 text-xl font-bold text-white">
              {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold text-gray-900">{user.name}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
        </div>

        <dl className="space-y-3 text-sm">
          <div className="flex justify-between border-t border-gray-100 pt-3">
            <dt className="text-gray-500">Member since</dt>
            <dd className="text-gray-900">
              {new Date(user.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </dd>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-3">
            <dt className="text-gray-500">Plan</dt>
            <dd className="text-gray-900 capitalize">{user.tier}</dd>
          </div>
          <div className="flex justify-between border-t border-gray-100 pt-3">
            <dt className="text-gray-500">Profile visibility</dt>
            <dd className="text-gray-900">{user.profile_public ? "Public" : "Private"}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
