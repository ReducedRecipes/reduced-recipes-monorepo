import { useState } from "react";

interface IngredientBoardProps {
  title: string;
  items: string[];
  onAdd: (item: string) => void;
  onRemove: (item: string) => void;
  negative?: boolean;
  suggestions?: string[];
}

export default function IngredientBoard({
  title,
  items,
  onAdd,
  onRemove,
  negative,
  suggestions = [],
}: IngredientBoardProps) {
  const [q, setQ] = useState("");

  const filtered = suggestions
    .filter((s) => !items.includes(s) && s.includes(q.toLowerCase()))
    .slice(0, 6);

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div
          className="caps"
          style={{ color: negative ? "var(--accent-ink)" : "var(--ink)" }}
        >
          {negative ? "— " : "+ "} {title} ({items.length})
        </div>
        <div
          className="mono"
          style={{ fontSize: 10, color: "var(--ink-3)" }}
        >
          {negative ? "Never suggest" : "Must include"}
        </div>
      </div>
      <div
        style={{
          minHeight: 96,
          border: "1px solid var(--rule-2)",
          padding: 10,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignContent: "flex-start",
        }}
      >
        {items.map((it) => (
          <button
            key={it}
            onClick={() => onRemove(it)}
            className="mono"
            style={{
              fontSize: 11,
              padding: "6px 10px",
              background: negative ? "var(--accent)" : "var(--ink)",
              color: negative ? "#fff" : "var(--bg)",
              textTransform: "lowercase",
            }}
          >
            {it} &times;
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={negative ? "add an exclusion\u2026" : "add an ingredient\u2026"}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              onAdd(q.trim().toLowerCase());
              setQ("");
            }
          }}
          style={{
            border: 0,
            outline: "none",
            background: "transparent",
            flex: 1,
            minWidth: 140,
            fontSize: 13,
            padding: "6px 4px",
          }}
        />
      </div>
      {q && filtered.length > 0 && (
        <div
          style={{
            marginTop: 6,
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
          }}
        >
          {filtered.map((s) => (
            <button
              key={s}
              onClick={() => {
                onAdd(s);
                setQ("");
              }}
              className="mono"
              style={{
                fontSize: 11,
                padding: "4px 8px",
                border: "1px dashed var(--rule-2)",
                color: "var(--ink-2)",
              }}
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
