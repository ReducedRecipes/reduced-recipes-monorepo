import { Stat } from "../design-system";
import { Rule } from "../design-system";

export function NutritionPanel() {
  return (
    <section>
      <Rule label="Nutrition (est.)" style={{ marginBottom: 16 }} />
      <div className="grid grid-cols-3 gap-6 sm:grid-cols-5">
        <Stat k="Calories" v="—" />
        <Stat k="Protein" v="—" sub="g" />
        <Stat k="Fat" v="—" sub="g" />
        <Stat k="Carbs" v="—" sub="g" />
        <Stat k="Sodium" v="—" sub="mg" />
      </div>
      <p className="mt-4 font-mono text-xs text-ink-3">
        Nutrition data not yet available for this recipe.
      </p>
    </section>
  );
}
