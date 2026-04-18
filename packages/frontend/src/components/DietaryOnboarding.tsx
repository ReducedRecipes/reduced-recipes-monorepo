import { useState, useEffect } from "react";
import { DIETARY_LABELS, type DietaryRestriction } from "@rr/shared/dietary";
import { getDietaryRecipeCount, setDietaryPreferences } from "../lib/api";

interface DietaryOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

const allRestrictions = Object.keys(DIETARY_LABELS) as DietaryRestriction[];

export function DietaryOnboarding({ isOpen, onClose }: DietaryOnboardingProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recipeCount, setRecipeCount] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (selected.size === 0) {
      setRecipeCount(null);
      return;
    }

    const timer = setTimeout(() => {
      getDietaryRecipeCount(Array.from(selected))
        .then((res) => setRecipeCount(res.count))
        .catch(() => setRecipeCount(null));
    }, 500);

    return () => clearTimeout(timer);
  }, [selected, isOpen]);

  if (!isOpen) return null;

  const toggle = (restriction: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(restriction)) {
        next.delete(restriction);
      } else {
        next.add(restriction);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDietaryPreferences(Array.from(selected));
      localStorage.setItem("dietary_onboarding_shown", "true");
      onClose();
    } catch {
      // allow retry
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-2 text-xl font-bold text-gray-900">
          Dietary Preferences
        </h2>
        <p className="mb-4 text-sm text-gray-600">
          Select any dietary restrictions to personalize your recipe
          recommendations.
        </p>

        <div className="mb-4 flex flex-wrap gap-2">
          {allRestrictions.map((restriction) => {
            const isSelected = selected.has(restriction);
            return (
              <button
                key={restriction}
                type="button"
                onClick={() => toggle(restriction)}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                  isSelected
                    ? "border-green-500 bg-green-100 text-green-800"
                    : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
                }`}
              >
                {DIETARY_LABELS[restriction]}
              </button>
            );
          })}
        </div>

        {recipeCount !== null && (
          <p className="mb-4 text-sm text-gray-600">
            <span className="font-semibold text-green-700">{recipeCount}</span>{" "}
            recipes match your preferences
          </p>
        )}

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleSkip}
            className="rounded-lg px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Skip
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
