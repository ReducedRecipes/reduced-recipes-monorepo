import { Stat } from "../design-system";

interface StatRailProps {
  totalTime: number | null;
  prepTime: number | null;
  cookTime: number | null;
  yields: string | null;
  ingredientCount: number;
  stepCount: number;
}

function fmtTime(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const hrs = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${hrs}h ${m}m` : `${hrs}h`;
}

function parseServings(yields: string | null): string {
  if (!yields) return "—";
  const m = yields.match(/(\d+)/);
  return m ? m[1]! : yields;
}

export function StatRail({
  totalTime,
  prepTime,
  cookTime,
  yields,
  ingredientCount,
  stepCount,
}: StatRailProps) {
  const activeTime = prepTime ?? cookTime;

  return (
    <div className="grid grid-cols-3 gap-6 border-y border-rule py-5 sm:grid-cols-6">
      <Stat k="Total" v={fmtTime(totalTime)} />
      <Stat k="Active" v={fmtTime(activeTime)} />
      <Stat k="Servings" v={parseServings(yields)} />
      <Stat k="Per serving" v="—" sub="kcal" />
      <Stat k="Ingredients" v={ingredientCount} />
      <Stat k="Steps" v={stepCount} />
    </div>
  );
}
