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
  const next = useCallback(
    () => setCurrent((c) => Math.min(total - 1, c + 1)),
    [total],
  );

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
      <div className="h-1 w-full bg-[oklch(0.20_0.01_60)]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: "var(--accent)" }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-8 py-4">
        <span
          className="mono text-xs uppercase tracking-wider"
          style={{ color: "oklch(0.50 0.01 60)" }}
        >
          {title}
        </span>
        <button
          onClick={onExit}
          className="mono text-xs uppercase tracking-wider transition-colors hover:text-white"
          style={{ color: "oklch(0.50 0.01 60)" }}
        >
          ESC to exit
        </button>
      </div>

      {/* Step content */}
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="max-w-3xl text-center">
          <div
            className="mono mb-6 text-xs uppercase tracking-wider"
            style={{ color: "oklch(0.45 0.01 60)" }}
          >
            Step {current + 1} of {total}
          </div>
          <p
            className="serif text-3xl leading-relaxed italic sm:text-4xl lg:text-5xl"
            style={{ color: "oklch(0.92 0.005 60)" }}
          >
            {steps[current]}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-8 py-6">
        <button
          onClick={prev}
          disabled={current === 0}
          className="mono text-sm uppercase tracking-wider transition-colors disabled:opacity-30"
          style={{ color: "oklch(0.65 0.01 60)" }}
        >
          ← Prev
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrent(i)}
              className="h-2 w-2 rounded-full transition-all"
              style={{
                background:
                  i === current
                    ? "var(--accent)"
                    : i < current
                      ? "oklch(0.45 0.01 60)"
                      : "oklch(0.25 0.01 60)",
              }}
            />
          ))}
        </div>
        <button
          onClick={next}
          disabled={current === total - 1}
          className="mono text-sm uppercase tracking-wider transition-colors disabled:opacity-30"
          style={{ color: "oklch(0.65 0.01 60)" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
