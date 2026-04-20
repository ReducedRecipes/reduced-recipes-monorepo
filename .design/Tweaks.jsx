// Tweaks panel — floating bottom-right
const { useState: useS_T, useEffect: useE_T } = React;

function Tweaks({ state, setState }) {
  const [open, setOpen] = useS_T(true);

  const update = (k, v) => {
    const next = { ...state, [k]: v };
    setState(next);
    window.parent.postMessage({type:"__edit_mode_set_keys", edits: { [k]: v }}, "*");
  };

  return (
    <div style={{
      position:"fixed", bottom:18, right:18, zIndex:500,
      width: open ? 280 : 120,
      background:"var(--bg)",
      border:"1px solid var(--ink)",
      fontFamily:"var(--mono)",
      fontSize:11,
      boxShadow:"0 10px 40px oklch(0.2 0.01 60 / 0.15)"
    }}>
      <button onClick={()=>setOpen(!open)} style={{
        width:"100%",
        display:"flex", justifyContent:"space-between", alignItems:"center",
        padding:"10px 14px",
        background:"var(--ink)", color:"var(--bg)",
        letterSpacing:"0.12em", textTransform:"uppercase", fontSize:11
      }}>
        <span>◆ Tweaks</span>
        <span>{open ? "—" : "+"}</span>
      </button>
      {open && (
        <div style={{padding:"14px"}}>
          <Row label="Theme">
            <Seg value={state.theme} options={["warm","cool","mono"]} onChange={v=>update("theme",v)}/>
          </Row>
          <Row label="Density">
            <Seg value={state.density} options={["tight","normal","airy"]} onChange={v=>update("density",v)}/>
          </Row>
          <Row label="Imagery">
            <Seg value={state.showImagery ? "on" : "off"} options={["on","off"]} onChange={v=>update("showImagery", v==="on")}/>
          </Row>
          <Row label="Tone">
            <Seg value={state.tone} options={["deadpan","snark","warm"]} onChange={v=>update("tone",v)}/>
          </Row>
          <div style={{marginTop:8, padding:"8px 0 0", borderTop:"1px solid var(--rule)", color:"var(--ink-3)", fontSize:10}}>
            Saved with the design.
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:6, marginBottom:12}}>
      <div style={{fontSize:10, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--ink-3)"}}>{label}</div>
      {children}
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <div style={{display:"flex", border:"1px solid var(--rule-2)"}}>
      {options.map((o,i) => (
        <button key={o} onClick={()=>onChange(o)} style={{
          flex:1, padding:"6px 8px",
          background: value===o ? "var(--ink)" : "transparent",
          color: value===o ? "var(--bg)" : "var(--ink-2)",
          borderLeft: i===0 ? "none" : "1px solid var(--rule-2)",
          textTransform:"uppercase", letterSpacing:"0.06em", fontSize:10
        }}>{o}</button>
      ))}
    </div>
  );
}

window.Tweaks = Tweaks;
