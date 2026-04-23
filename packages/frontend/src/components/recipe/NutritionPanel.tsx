import { Stat } from "../design-system";
import { Rule } from "../design-system";
import type { RecipeDocument } from "@rr/shared/types";

interface NutritionPanelProps {
  nutrition?: RecipeDocument['nutrition'];
}

export function NutritionPanel({ nutrition }: NutritionPanelProps) {
  const fmt = (v: number | null | undefined) => v != null ? String(Math.round(v)) : '—';

  const label = nutrition?.source === 'schema'
    ? 'Nutrition (per serving)'
    : nutrition?.source === 'ai'
    ? 'Nutrition (est.)'
    : 'Nutrition (est.)';

  return (
    <section>
      <Rule label={label} style={{ marginBottom: 16 }} />
      <div className="grid grid-cols-3 gap-6 sm:grid-cols-5">
        <Stat k="Calories" v={fmt(nutrition?.calories)} />
        <Stat k="Protein" v={fmt(nutrition?.protein_g)} sub="g" />
        <Stat k="Fat" v={fmt(nutrition?.fat_g)} sub="g" />
        <Stat k="Carbs" v={fmt(nutrition?.carbs_g)} sub="g" />
        <Stat k="Sodium" v={fmt(nutrition?.sodium_mg)} sub="mg" />
      </div>
      {!nutrition && (
        <p className="mt-4 font-mono text-xs text-ink-3">
          Nutrition data not yet available for this recipe.
        </p>
      )}
      {nutrition?.source === 'ai' && (
        <p className="mt-4 font-mono text-xs text-ink-3">
          Estimated by AI from ingredients. Values are approximate.
        </p>
      )}
    </section>
  );
}
