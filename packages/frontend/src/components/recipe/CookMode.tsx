import { useState, useEffect, useCallback } from "react";

interface CookModeProps {
  steps: string[];
  title: string;
  onExit: () => void;
}

export function CookMode({ steps, title, onExit }: CookModeProps) {
  const [current, setCurrent] = useState(0);
  const total = steps.length;

  const prev = useCallback(() => setCurrent((c) => Math.max(0, c - 1)), []);
  const next = useCallback(() => setCurrent((c) => Math.min(total - 1, c + 1)), [total]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, prev, next]);

  const progress = total > 1 ? ((current + 1) / total) * 100 : 100;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "oklch(0.12 0.01 60)" }}
    >
      {/* Progress bar */}
      <div className="h-1 w-full" style={{ background: "oklch(0.20 0.01 60)" }}>
        <div
          className="h-full"
          style={{ width: `${progress}%`, background: "var(--accent)", transition: "width 0.3s ease" }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 sm:px-8">
        <span className="mono text-xs uppercase tracking-wider" style={{ color: "oklch(0.50 0.01 60)" }}>
          {title}
        </span>
        <button
          onClick={onExit}
          className="mono text-xs uppercase tracking-wider"
          style={{ color: "oklch(0.50 0.01 60)" }}
        >
          ✕ Exit
        </button>
      </div>

      {/* Step content */}
      <div className="flex flex-1 items-center justify-center px-6 sm:px-8">
        <div className="max-w-3xl text-center">
          <div
            className="mono mb-4 text-xs uppercase tracking-wider sm:mb-6"
            style={{ color: "oklch(0.45 0.01 60)" }}
          >
            Step {current + 1} of {total}
          </div>
          <p
            className="serif text-2xl leading-relaxed italic sm:text-4xl lg:text-5xl"
            style={{ color: "oklch(0.92 0.005 60)" }}
          >
            {steps[current]}
          </p>
          {current < total - 1 && (
            <p className="mt-6 text-sm sm:mt-8" style={{ color: "oklch(0.40 0.01 60)" }}>
              Next: {steps[current + 1]?.slice(0, 80)}…
            </p>
          )}
          {current === total - 1 && (
            <p className="mt-6 text-sm sm:mt-8" style={{ color: "oklch(0.40 0.01 60)" }}>
              Final step. Plate and serve.
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-6">
        <button
          onClick={prev}
          disabled={current === 0}
          className="mono text-sm uppercase tracking-wider disabled:opacity-30"
          style={{ color: "oklch(0.65 0.01 60)", padding: "12px 16px" }}
        >
          ← Prev
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="rounded-full"
              style={{
                height: 8,
                width: i === current ? 16 : 8,
                background:
                  i === current
                    ? "var(--accent)"
                    : i < current
                      ? "oklch(0.45 0.01 60)"
                      : "oklch(0.25 0.01 60)",
                transition: "all 0.3s ease",
              }}
            />
          ))}
        </div>
        <button
          onClick={next}
          disabled={current === total - 1}
          className="mono text-sm uppercase tracking-wider disabled:opacity-30"
          style={{ color: "oklch(0.65 0.01 60)", padding: "12px 16px" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
