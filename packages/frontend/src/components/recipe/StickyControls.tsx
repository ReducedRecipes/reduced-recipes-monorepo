import { Pill } from "../design-system";

interface StickyControlsProps {
  servings: number;
  onServingsChange: (n: number) => void;
  unitSystem: "us" | "metric";
  onUnitToggle: () => void;
  onPrint: () => void;
  onCookMode: () => void;
  bookmarkSlot?: React.ReactNode;
}

export function StickyControls({
  servings,
  onServingsChange,
  unitSystem,
  onUnitToggle,
  onPrint,
  onCookMode,
  bookmarkSlot,
}: StickyControlsProps) {
  return (
    <div className="sticky top-[140px] z-[5] -mx-4 border-y border-rule bg-bg px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        {/* Servings adjuster */}
        <div className="flex items-center gap-2">
          <span className="caps text-ink-3">Servings</span>
          <div className="flex items-center border border-rule">
            <button
              onClick={() => onServingsChange(Math.max(1, servings - 1))}
              className="px-2.5 py-1 font-mono text-sm text-ink-2 transition-colors hover:bg-bg-2"
            >
              −
            </button>
            <span className="min-w-[2rem] border-x border-rule px-2 py-1 text-center font-mono text-sm">
              {servings}
            </span>
            <button
              onClick={() => onServingsChange(servings + 1)}
              className="px-2.5 py-1 font-mono text-sm text-ink-2 transition-colors hover:bg-bg-2"
            >
              +
            </button>
          </div>
        </div>

        {/* Unit toggle */}
        <div className="flex">
          <Pill active={unitSystem === "us"} onClick={onUnitToggle}>
            US
          </Pill>
          <Pill
            active={unitSystem === "metric"}
            onClick={onUnitToggle}
            style={{ marginLeft: -1 }}
          >
            Metric
          </Pill>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Action buttons */}
        {bookmarkSlot}
        <Pill onClick={onPrint}>Print</Pill>
        <button
          onClick={onCookMode}
          className="mono px-3 py-1.5 text-[11px] uppercase tracking-[0.06em] border border-accent bg-accent text-bg transition-all hover:opacity-90"
        >
          Cook mode
        </button>
      </div>
    </div>
  );
}
