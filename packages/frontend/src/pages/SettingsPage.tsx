import { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { apiFetch, getDietaryPreferences, setDietaryPreferences } from "../lib/api";
import { DIETARY_LABELS, type DietaryRestriction } from "@rr/shared/dietary";
import { Rule, Pill } from "../components/design-system";

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [selectedRestrictions, setSelectedRestrictions] = useState<Set<string>>(new Set());
  const [dietarySaving, setDietarySaving] = useState(false);
  const [matchingCount, setMatchingCount] = useState<number | null>(null);
  const [dietaryLoaded, setDietaryLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    getDietaryPreferences()
      .then((res) => {
        setSelectedRestrictions(new Set(res.restrictions));
        setDietaryLoaded(true);
      })
      .catch(() => setDietaryLoaded(true));
  }, [isAuthenticated]);

  const toggleRestriction = (key: string) => {
    setSelectedRestrictions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
    setMatchingCount(null);
  };

  const handleSaveDietary = async () => {
    setDietarySaving(true);
    try {
      const res = await setDietaryPreferences(Array.from(selectedRestrictions));
      setMatchingCount(res.matching_recipe_count);
    } catch {
      // allow retry
    } finally {
      setDietarySaving(false);
    }
  };

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

  const handleDeleteAccount = async () => {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/users/me", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      logout();
      navigate("/", { replace: true });
    } catch {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setSaving(true);
    try {
      const data = await apiFetch<Record<string, unknown>>("/users/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "reduced-recipes-data.json";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 0" }}>
      <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 16 }}>
        ◆ Settings
      </div>
      <h1 className="serif" style={{ fontSize: 40, margin: "0 0 40px", lineHeight: 1 }}>
        Preferences
      </h1>

      {/* Dietary Preferences */}
      <section style={{ marginBottom: 40 }}>
        <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 12 }}>
          Dietary restrictions
        </div>
        <p style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 16, maxWidth: 440 }}>
          Select your dietary restrictions to filter recipes automatically.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, opacity: dietaryLoaded ? 1 : 0.5 }}>
          {(Object.keys(DIETARY_LABELS) as DietaryRestriction[]).map((key) => (
            <Pill
              key={key}
              active={selectedRestrictions.has(key)}
              onClick={() => dietaryLoaded && toggleRestriction(key)}
            >
              {DIETARY_LABELS[key]}
            </Pill>
          ))}
        </div>
        {matchingCount !== null && (
          <div className="mono" style={{ marginTop: 12, fontSize: 12, color: "var(--ink-2)" }}>
            <span style={{ color: "var(--accent-ink)", fontWeight: 600 }}>{matchingCount}</span>{" "}
            recipes match your preferences
          </div>
        )}
        <div style={{ marginTop: 20 }}>
          <button
            onClick={handleSaveDietary}
            disabled={dietarySaving || !dietaryLoaded}
            className="mono"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "12px 20px",
              background: "var(--ink)",
              color: "var(--bg)",
              border: "1px solid var(--ink)",
              opacity: dietarySaving || !dietaryLoaded ? 0.5 : 1,
              cursor: dietarySaving || !dietaryLoaded ? "not-allowed" : "pointer",
            }}
          >
            {dietarySaving ? "Saving..." : "Save preferences"}
          </button>
        </div>
      </section>

      <Rule />

      {/* Data & Privacy */}
      <section style={{ marginTop: 32 }}>
        <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 20 }}>
          Data &amp; Privacy
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "var(--ink)" }}>Export your data</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              Download all your data as JSON
            </div>
          </div>
          <button
            onClick={handleExport}
            disabled={saving}
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "10px 16px",
              background: "transparent",
              color: "var(--ink)",
              border: "1px solid var(--rule-2)",
              opacity: saving ? 0.5 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            Export
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "14px 0",
            borderBottom: "1px solid var(--rule)",
          }}
        >
          <div>
            <div style={{ fontSize: 14, color: "oklch(0.50 0.15 25)" }}>Delete account</div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
              Permanently delete your account and all data
            </div>
          </div>
          <button
            onClick={handleDeleteAccount}
            disabled={saving}
            className="mono"
            style={{
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "10px 16px",
              background: deleteConfirm ? "oklch(0.50 0.15 25)" : "transparent",
              color: deleteConfirm ? "var(--bg)" : "oklch(0.50 0.15 25)",
              border: `1px solid oklch(0.50 0.15 25)`,
              opacity: saving ? 0.5 : 1,
              cursor: saving ? "not-allowed" : "pointer",
            }}
          >
            {deleteConfirm ? "Confirm delete" : "Delete account"}
          </button>
        </div>
      </section>
    </main>
  );
}
