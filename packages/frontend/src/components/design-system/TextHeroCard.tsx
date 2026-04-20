interface Ingredient {
  qty?: number;
  unit?: string;
  item: string;
}

interface Step {
  t: number;
  text: string;
}

interface TextHeroCardProps {
  recipe: {
    id: string;
    ingredients?: Ingredient[];
    steps?: Step[];
  };
}

export function TextHeroCard({ recipe }: TextHeroCardProps) {
  if (!recipe) return null;

  return (
    <div
      style={{
        border: "1px solid var(--ink)",
        padding: "28px 26px",
        background: "var(--bg-2)",
        fontFamily: "var(--mono)",
        fontSize: 12,
        lineHeight: 1.75,
        minHeight: 340,
      }}
    >
      <div style={{ color: "var(--ink-3)" }}>// {recipe.id}.recipe</div>
      <div style={{ color: "var(--accent-ink)", marginTop: 8 }}>
        ingredients:
      </div>
      {recipe.ingredients?.slice(0, 6).map((ing, i) => (
        <div key={i}>
          {"  "}
          <span style={{ color: "var(--ink-3)" }}>
            {String(i + 1).padStart(2, "0")}
          </span>
          {"  "}
          {ing.qty} {ing.unit} {ing.item}
        </div>
      ))}
      <div style={{ color: "var(--accent-ink)", marginTop: 10 }}>method:</div>
      {recipe.steps?.slice(0, 3).map((s, i) => (
        <div key={i} style={{ color: "var(--ink-2)" }}>
          {"  "}&rarr; t+{s.t}min &middot; {s.text.slice(0, 48)}&hellip;
        </div>
      ))}
    </div>
  );
}
