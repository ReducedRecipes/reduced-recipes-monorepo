// Small shared UI primitives
const { useState, useEffect, useRef, useMemo, useCallback } = React;

// Subtle striped placeholder — hairlines over warm card, labeled in mono
function FoodPlaceholder({ label, ratio = "4/3", tone = "warm" }) {
  const bg  = tone === "warm" ? "oklch(0.90 0.020 70)" : "oklch(0.88 0.008 70)";
  const ink = "oklch(0.40 0.020 60)";
  return (
    <div style={{
      position:"relative", width:"100%", aspectRatio: ratio,
      background: bg,
      backgroundImage: `repeating-linear-gradient(135deg, transparent 0 10px, ${tone==="warm"?"oklch(0.86 0.025 70)":"oklch(0.84 0.010 70)"} 10px 11px)`,
      overflow:"hidden",
      display:"flex", alignItems:"flex-end", padding:"10px 12px",
      color: ink
    }}>
      <div style={{fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", letterSpacing:"0.08em"}}>
        [ photo · {label} ]
      </div>
    </div>
  );
}

// Live ticker number (flips in place)
function Ticker({ value, duration = 1200 }) {
  const [n, setN] = useState(Math.floor(value * 0.7));
  useEffect(() => {
    let start;
    const from = n, to = value;
    let raf;
    const tick = (t) => {
      if (!start) start = t;
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

// Hairline divider with optional label on the left
function Rule({ label, style }) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:12, ...style}}>
      {label && <span className="caps" style={{color:"var(--ink-3)"}}>{label}</span>}
      <div style={{flex:1, borderTop:"1px solid var(--rule)"}}/>
    </div>
  );
}

// Compact stat block
function Stat({ k, v, sub }) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:2, minWidth:0}}>
      <div className="caps" style={{color:"var(--ink-3)"}}>{k}</div>
      <div style={{fontFamily:"var(--mono)", fontSize:15, color:"var(--ink)"}}>{v}{sub && <span style={{color:"var(--ink-3)"}}> {sub}</span>}</div>
    </div>
  );
}

function Pill({ children, onClick, active, style }) {
  return (
    <button onClick={onClick} className="mono" style={{
      fontSize:11, textTransform:"uppercase", letterSpacing:"0.06em",
      padding:"6px 10px",
      border:"1px solid " + (active ? "var(--ink)" : "var(--rule)"),
      background: active ? "var(--ink)" : "transparent",
      color: active ? "var(--bg)" : "var(--ink-2)",
      borderRadius: 0,
      transition:"all 120ms ease",
      ...style
    }}>{children}</button>
  );
}

Object.assign(window, { FoodPlaceholder, Ticker, Rule, Stat, Pill });
