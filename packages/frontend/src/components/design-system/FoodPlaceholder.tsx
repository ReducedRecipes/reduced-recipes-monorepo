interface FoodPlaceholderProps {
  label: string;
  ratio?: string;
  tone?: "warm" | "cool";
}

export function FoodPlaceholder({
  label,
  ratio = "4/3",
  tone = "warm",
}: FoodPlaceholderProps) {
  const bg =
    tone === "warm" ? "oklch(0.90 0.020 70)" : "oklch(0.88 0.008 70)";
  const stripe =
    tone === "warm" ? "oklch(0.86 0.025 70)" : "oklch(0.84 0.010 70)";
  const ink = "oklch(0.40 0.020 60)";

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: ratio,
        background: bg,
        backgroundImage: `repeating-linear-gradient(135deg, transparent 0 10px, ${stripe} 10px 11px)`,
        overflow: "hidden",
        display: "flex",
        alignItems: "flex-end",
        padding: "10px 12px",
        color: ink,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        [ photo &middot; {label} ]
      </div>
    </div>
  );
}
