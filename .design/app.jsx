// App shell
const { useState: useS_App, useEffect: useE_App } = React;

function App() {
  const [route, setRoute] = useS_App(() => localStorage.getItem("rr_route") || "home");
  const [recipeId, setRecipeId] = useS_App(() => localStorage.getItem("rr_recipe") || "creamy-tuscan-chicken");
  const [tweaks, setTweaks] = useS_App(() => ({ ...window.__TWEAKS__ }));
  const [editMode, setEditMode] = useS_App(false);

  // Persist
  useE_App(() => { localStorage.setItem("rr_route", route); }, [route]);
  useE_App(() => { localStorage.setItem("rr_recipe", recipeId); }, [recipeId]);

  // Apply theme/density
  useE_App(() => {
    const root = document.documentElement;
    root.setAttribute("data-density", tweaks.density);

    if (tweaks.theme === "warm") {
      root.style.setProperty("--bg", "oklch(0.97 0.008 85)");
      root.style.setProperty("--bg-2", "oklch(0.94 0.012 85)");
      root.style.setProperty("--ink", "oklch(0.18 0.012 60)");
      root.style.setProperty("--ink-2", "oklch(0.38 0.012 60)");
      root.style.setProperty("--accent", "oklch(0.62 0.18 30)");
      root.style.setProperty("--accent-ink", "oklch(0.32 0.12 30)");
    } else if (tweaks.theme === "cool") {
      root.style.setProperty("--bg", "oklch(0.97 0.006 240)");
      root.style.setProperty("--bg-2", "oklch(0.94 0.010 240)");
      root.style.setProperty("--ink", "oklch(0.20 0.020 250)");
      root.style.setProperty("--ink-2", "oklch(0.40 0.020 250)");
      root.style.setProperty("--accent", "oklch(0.58 0.18 250)");
      root.style.setProperty("--accent-ink", "oklch(0.32 0.14 250)");
    } else if (tweaks.theme === "mono") {
      root.style.setProperty("--bg", "oklch(0.98 0 0)");
      root.style.setProperty("--bg-2", "oklch(0.95 0 0)");
      root.style.setProperty("--ink", "oklch(0.15 0 0)");
      root.style.setProperty("--ink-2", "oklch(0.38 0 0)");
      root.style.setProperty("--accent", "oklch(0.15 0 0)");
      root.style.setProperty("--accent-ink", "oklch(0.15 0 0)");
    }
  }, [tweaks.theme, tweaks.density]);

  // Edit mode wiring
  useE_App(() => {
    const handler = (e) => {
      if (!e.data) return;
      if (e.data.type === "__activate_edit_mode") setEditMode(true);
      if (e.data.type === "__deactivate_edit_mode") setEditMode(false);
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({type:"__edit_mode_available"}, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  const openRecipe = (id) => { setRecipeId(id); setRoute("recipe"); window.scrollTo({top:0, behavior:"instant"}); };
  const nav = (k) => {
    const keyMap = {"Browse":"browse","Ingredients":"home","Collections":"home","Almanac":"about"};
    const r = keyMap[k] || k;
    setRoute(r);
    window.scrollTo({top:0, behavior:"instant"});
  };

  return (
    <>
      <TopBar onSearch={()=>{}} onNav={nav} route={route}/>
      <div data-screen-label={route === "recipe" ? "02 Recipe" : route === "home" ? "01 Home" : route === "about" ? "03 Manifesto" : "01 Home"}>
        {(route === "home" || route === "browse") && <Home onOpenRecipe={openRecipe} showImagery={tweaks.showImagery}/>}
        {route === "recipe" && <RecipePage id={recipeId} onBack={()=>setRoute("home")} showImagery={tweaks.showImagery}/>}
        {route === "about" && <Manifesto/>}
      </div>

      {editMode && <Tweaks state={tweaks} setState={setTweaks}/>}
    </>
  );
}

function Manifesto() {
  return (
    <main style={{padding:"80px 24px", maxWidth:900, margin:"0 auto"}}>
      <div className="caps" style={{color:"var(--accent-ink)", marginBottom:16}}>◆ Fig. 000 — Manifesto</div>
      <h1 className="serif" style={{fontSize:"clamp(48px, 6vw, 84px)", fontStyle:"italic", lineHeight:0.95, letterSpacing:"-0.02em", fontWeight:400, margin:"0 0 40px"}}>
        We cut the bullshit.
      </h1>
      <div style={{fontSize:18, lineHeight:1.6, color:"var(--ink-2)", maxWidth:640, display:"flex", flexDirection:"column", gap:20}}>
        <p>A recipe is a list of ingredients and a sequence of steps. Nothing more is required for dinner to happen.</p>
        <p>The modern internet disagrees. It wants you to scroll past a 900-word essay, a wedding anecdote, and three full-screen ads before you learn that the answer is, and has always been, chicken thighs.</p>
        <p>We don't do that. We index two million recipes and strip them to the part that actually makes dinner. We keep the name, the numbers, the ingredients, and the steps. We delete the rest.</p>
        <p>If the story matters, we'll tell it in four sentences, at the end, so you can skip it without scrolling.</p>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:1, background:"var(--rule-2)", border:"1px solid var(--rule-2)", marginTop:60}}>
        {[
          ["Words removed", "184M"],
          ["Ads bypassed", "14,201"],
          ["Scrolls saved", "≈ 9 km"],
          ["Avg. time to ingredients", "0.4 s"],
          ["Avg. recipe length", "182 words"],
          ["Stories per recipe", "0"],
        ].map(([k,v]) => (
          <div key={k} style={{background:"var(--bg)", padding:"24px 22px"}}>
            <div className="caps" style={{color:"var(--ink-3)"}}>{k}</div>
            <div className="serif" style={{fontSize:48, fontStyle:"italic", lineHeight:1.1, marginTop:4}}>{v}</div>
          </div>
        ))}
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
