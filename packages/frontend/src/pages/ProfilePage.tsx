import { useAuth } from "../hooks/useAuth";
import { useFollow } from "../hooks/useFollow";
import { useNavigate } from "react-router-dom";
import { CollectionList } from "../components/CollectionList";
import { Rule, Stat } from "../components/design-system";

export default function ProfilePage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { followerCount, followingCount, isLoading: followLoading } =
    useFollow(user?.id ?? "");

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading&hellip;
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    navigate("/", { replace: true });
    return null;
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 0" }}>
      <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 16 }}>
        ◆ Profile
      </div>

      {/* Identity */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 32 }}>
        {user.picture_url ? (
          <img
            src={user.picture_url}
            alt={user.name}
            style={{ width: 56, height: 56, objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--ink)",
              color: "var(--bg)",
              fontSize: 20,
              fontWeight: 700,
            }}
          >
            {user.name?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="serif" style={{ fontSize: 32, margin: 0, lineHeight: 1.1 }}>
            {user.name}
          </h1>
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
            {user.email}
          </div>
        </div>
      </div>

      {/* Stats */}
      {!followLoading && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 32 }}>
          <Stat k="Followers" v={followerCount} />
          <Stat k="Following" v={followingCount} />
          <Stat k="Plan" v={user.tier} />
        </div>
      )}

      <Rule />

      {/* Details */}
      <div style={{ marginTop: 24 }}>
        <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
          Details
        </div>
        <dl style={{ margin: 0 }}>
          {[
            ["Member since", new Date(user.created_at).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })],
            ["Visibility", user.profile_public ? "Public" : "Private"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <dt className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>{label}</dt>
              <dd style={{ margin: 0, fontSize: 14, color: "var(--ink)" }}>{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <Rule style={{ marginTop: 32 }} />

      {/* Collections */}
      <div style={{ marginTop: 24 }}>
        <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
          Collections
        </div>
        <CollectionList />
      </div>
    </main>
  );
}
