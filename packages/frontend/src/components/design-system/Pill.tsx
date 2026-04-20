import type { CSSProperties, ReactNode } from "react";

interface PillProps {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  style?: CSSProperties;
}

export function Pill({ children, onClick, active, style }: PillProps) {
  return (
    <button
      onClick={onClick}
      className="mono"
      style={{
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "6px 10px",
        border: "1px solid " + (active ? "var(--ink)" : "var(--rule)"),
        background: active ? "var(--ink)" : "transparent",
        color: active ? "var(--bg)" : "var(--ink-2)",
        borderRadius: 0,
        transition: "all 120ms ease",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
