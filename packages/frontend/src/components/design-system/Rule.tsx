import type { CSSProperties } from "react";

interface RuleProps {
  label?: string;
  style?: CSSProperties;
}

export function Rule({ label, style }: RuleProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, ...style }}>
      {label && (
        <span className="caps" style={{ color: "var(--ink-3)" }}>
          {label}
        </span>
      )}
      <div style={{ flex: 1, borderTop: "1px solid var(--rule)" }} />
    </div>
  );
}
