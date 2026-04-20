interface TextThumbProps {
  recipe: {
    id: string;
    title: string;
    time: number;
    reviews: number;
  };
}

export function TextThumb({ recipe }: TextThumbProps) {
  const titleWords = recipe.title.split(" ");
  const firstWord = titleWords[0];
  const rest = titleWords.slice(1).join(" ");

  return (
    <div
      style={{
        aspectRatio: "1/1",
        border: "1px solid var(--rule-2)",
        padding: "14px 12px",
        background: "var(--bg-2)",
        fontFamily: "var(--mono)",
        fontSize: 10,
        color: "var(--ink-3)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div />
      <div
        style={{
          color: "var(--ink)",
          fontFamily: "var(--serif)",
          fontSize: 28,
          lineHeight: 1,
          fontStyle: "italic",
        }}
      >
        {firstWord}
        <br />
        <span style={{ color: "var(--ink-3)" }}>{rest}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span>{recipe.time}m</span>
        <span>n={recipe.reviews}</span>
      </div>
    </div>
  );
}
