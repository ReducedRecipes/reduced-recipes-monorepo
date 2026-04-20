import { useState, useEffect } from "react";

interface TickerProps {
  value: number;
  duration?: number;
}

export function Ticker({ value, duration = 1200 }: TickerProps) {
  const [n, setN] = useState(Math.floor(value * 0.7));

  useEffect(() => {
    let start: number | undefined;
    const from = n;
    const to = value;
    let raf: number;

    const tick = (t: number) => {
      if (start === undefined) start = t;
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.floor(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return <span className="mono">{n.toLocaleString()}</span>;
}
