import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../lib/api";
import { DIETARY_LABELS, type DietaryRestriction } from "@rr/shared/dietary";

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);

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
    <div className="mx-auto max-w-2xl py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Settings</h1>

      {/* Dietary Preferences */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dietary Preferences</h2>
        <p className="text-sm text-gray-500 mb-4">
          Select your dietary restrictions to filter recipes automatically.
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(DIETARY_LABELS) as DietaryRestriction[]).map((key) => (
            <button
              key={key}
              className="rounded-full border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:border-orange-500 hover:text-orange-600 transition-colors"
            >
              {DIETARY_LABELS[key]}
            </button>
          ))}
        </div>
      </section>

      {/* Data & Privacy */}
      <section className="mb-8 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Data & Privacy</h2>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-900">Export your data</p>
              <p className="text-xs text-gray-500">Download all your data as JSON</p>
            </div>
            <button
              onClick={handleExport}
              disabled={saving}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Export
            </button>
          </div>

          <div className="border-t border-gray-100 pt-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-600">Delete account</p>
              <p className="text-xs text-gray-500">Permanently delete your account and all data</p>
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={saving}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                deleteConfirm
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "border border-red-300 text-red-600 hover:bg-red-50"
              } disabled:opacity-50`}
            >
              {deleteConfirm ? "Confirm delete" : "Delete account"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
