import type { ReactNode } from "react";

interface StatProps {
  k: string;
  v: ReactNode;
  sub?: string;
}

export function Stat({ k, v, sub }: StatProps) {
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}
    >
      <div className="caps" style={{ color: "var(--ink-3)" }}>
        {k}
      </div>
      <div
        style={{ fontFamily: "var(--mono)", fontSize: 15, color: "var(--ink)" }}
      >
        {v}
        {sub && <span style={{ color: "var(--ink-3)" }}> {sub}</span>}
      </div>
    </div>
  );
}
