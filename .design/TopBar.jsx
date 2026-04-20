// Top chrome — brand + nav + search
const { useState: useState_Nav } = React;

function TopBar({ onSearch, onNav, route }) {
  const [q, setQ] = useState_Nav("");
  return (
    <header style={{
      position:"sticky", top:0, zIndex:50,
      background:"var(--bg)",
      borderBottom:"1px solid var(--rule)",
    }}>
      {/* Skinny utility strip */}
      <div style={{
        borderBottom:"1px solid var(--rule)",
        fontFamily:"var(--mono)", fontSize:11, color:"var(--ink-3)",
        display:"flex", justifyContent:"space-between",
        padding:"6px 24px"
      }}>
        <div style={{display:"flex", gap:18}}>
          <span>EST. 2024</span>
          <span>·</span>
          <span>INDEX: <Ticker value={2147381}/> RECIPES</span>
          <span>·</span>
          <span>NO STORIES. NO ADS BEFORE THE INGREDIENTS.</span>
        </div>
        <div style={{display:"flex", gap:18}}>
          <span>v4.2</span>
          <span>ISSUE 17 — APR 2026</span>
        </div>
      </div>

      {/* Masthead */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"1fr auto 1fr",
        alignItems:"center",
        padding:"18px 24px",
        gap:24
      }}>
        <nav style={{display:"flex", gap:22}}>
          {["Browse","Ingredients","Collections","Almanac"].map((l,i) => (
            <button key={l} onClick={()=>onNav(l)} className="mono" style={{
              fontSize:12, textTransform:"uppercase", letterSpacing:"0.08em",
              color:"var(--ink-2)",
              borderBottom:"1px solid transparent",
              paddingBottom:2
            }}
            onMouseEnter={e=>e.currentTarget.style.borderBottomColor="var(--ink)"}
            onMouseLeave={e=>e.currentTarget.style.borderBottomColor="transparent"}
            >{l}</button>
          ))}
        </nav>

        <button onClick={()=>onNav("home")} style={{textAlign:"center", lineHeight:1}}>
          <div className="serif" style={{fontSize:32, letterSpacing:"-0.01em", fontStyle:"italic"}}>Reduced</div>
          <div className="mono" style={{fontSize:10, letterSpacing:"0.3em", textTransform:"uppercase", color:"var(--ink-3)", marginTop:2}}>R E C I P E S</div>
        </button>

        <div style={{display:"flex", justifyContent:"flex-end", alignItems:"center", gap:14}}>
          <form onSubmit={e=>{e.preventDefault(); onSearch(q);}}
                style={{
                  display:"flex", alignItems:"center",
                  border:"1px solid var(--rule-2)",
                  padding:"6px 10px", gap:8,
                  background:"var(--bg)",
                  minWidth: 280
                }}>
            <span className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>⌘K</span>
            <input value={q} onChange={e=>setQ(e.target.value)}
              placeholder="find a recipe, or list ingredients"
              style={{border:0, outline:"none", background:"transparent", flex:1, fontSize:13}}/>
          </form>
          <button className="mono" style={{fontSize:12, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--ink-2)"}}>Sign in</button>
        </div>
      </div>

      {/* Section nav — route aware */}
      <div style={{
        display:"flex", gap:0,
        borderTop:"1px solid var(--rule)",
        padding:"0 24px",
        fontFamily:"var(--mono)", fontSize:11
      }}>
        {[
          ["home","00 — Index"],
          ["browse","01 — Browse"],
          ["recipe","02 — Recipe"],
          ["about","03 — Manifesto"]
        ].map(([k,l]) => (
          <button key={k} onClick={()=>onNav(k)} style={{
            textTransform:"uppercase", letterSpacing:"0.08em",
            padding:"10px 16px",
            color: route===k ? "var(--ink)" : "var(--ink-3)",
            borderBottom: route===k ? "1px solid var(--ink)" : "1px solid transparent",
            marginBottom:-1,
            background: route===k ? "var(--bg-2)" : "transparent"
          }}>{l}</button>
        ))}
      </div>
    </header>
  );
}

window.TopBar = TopBar;
