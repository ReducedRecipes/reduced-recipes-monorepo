import { useState, useEffect, useCallback, useRef } from "react";

interface CookModeProps {
  steps: string[];
  title: string;
  onExit: () => void;
}

export function CookMode({ steps, title, onExit }: CookModeProps) {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<"left" | "right" | null>(null);
  const [animating, setAnimating] = useState(false);
  const total = steps.length;

  // Swipe tracking
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const touchDelta = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback(
    (idx: number, dir: "left" | "right") => {
      if (animating || idx < 0 || idx >= total) return;
      setDirection(dir);
      setAnimating(true);
      setTimeout(() => {
        setCurrent(idx);
        setDirection(null);
        setAnimating(false);
      }, 250);
    },
    [animating, total],
  );

  const prev = useCallback(() => goTo(current - 1, "right"), [current, goTo]);
  const next = useCallback(() => goTo(current + 1, "left"), [current, goTo]);

  // Keyboard navigation
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onExit();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit, prev, next]);

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    touchDelta.current = 0;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    touchDelta.current = e.touches[0].clientX - touchStart.current.x;
  };

  const handleTouchEnd = () => {
    if (!touchStart.current) return;
    const threshold = 60;
    if (touchDelta.current < -threshold) {
      next();
    } else if (touchDelta.current > threshold) {
      prev();
    }
    touchStart.current = null;
    touchDelta.current = 0;
  };

  const progress = total > 1 ? ((current + 1) / total) * 100 : 100;

  // Animation classes
  const slideClass = direction === "left"
    ? "cook-slide-out-left"
    : direction === "right"
      ? "cook-slide-out-right"
      : "cook-slide-in";

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "oklch(0.12 0.01 60)" }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar */}
      <div className="h-1 w-full bg-[oklch(0.20_0.01_60)]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${progress}%`, background: "var(--accent)" }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 sm:px-8">
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
          ✕ Exit
        </button>
      </div>

      {/* Step content with swipe animation */}
      <div
        ref={containerRef}
        className="flex flex-1 items-center justify-center overflow-hidden px-6 sm:px-8"
      >
        <div className={`max-w-3xl text-center ${slideClass}`}>
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
            <p
              className="mt-6 text-sm sm:mt-8 sm:text-base"
              style={{ color: "oklch(0.40 0.01 60)" }}
            >
              Next: {steps[current + 1]?.slice(0, 80)}…
            </p>
          )}
          {current === total - 1 && (
            <p
              className="mt-6 text-sm sm:mt-8 sm:text-base"
              style={{ color: "oklch(0.40 0.01 60)" }}
            >
              Final step. Plate and serve.
            </p>
          )}
        </div>
      </div>

      {/* Swipe hint on mobile */}
      <div
        className="text-center sm:hidden mono text-xs"
        style={{ color: "oklch(0.35 0.01 60)", paddingBottom: 8 }}
      >
        ← swipe to navigate →
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between px-6 py-4 sm:px-8 sm:py-6">
        <button
          onClick={prev}
          disabled={current === 0}
          className="mono text-sm uppercase tracking-wider transition-colors disabled:opacity-30"
          style={{ color: "oklch(0.65 0.01 60)", padding: "12px 16px" }}
        >
          ← Prev
        </button>
        <div className="flex gap-1.5">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                if (i !== current) goTo(i, i > current ? "left" : "right");
              }}
              className="h-2 w-2 rounded-full transition-all"
              style={{
                background:
                  i === current
                    ? "var(--accent)"
                    : i < current
                      ? "oklch(0.45 0.01 60)"
                      : "oklch(0.25 0.01 60)",
                width: i === current ? 16 : 8,
              }}
            />
          ))}
        </div>
        <button
          onClick={next}
          disabled={current === total - 1}
          className="mono text-sm uppercase tracking-wider transition-colors disabled:opacity-30"
          style={{ color: "oklch(0.65 0.01 60)", padding: "12px 16px" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}
