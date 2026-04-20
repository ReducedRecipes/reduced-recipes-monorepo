// Recipe page — stripped down
const { useState: useS_R, useMemo: useM_R, useEffect: useE_R } = React;

function RecipePage({ id, onBack, showImagery }) {
  const recipe = useM_R(() => window.__RECIPES__.find(r=>r.id===id), [id]);
  if (!recipe) return <div style={{padding:40}}>Recipe not found.</div>;

  const [servings, setServings] = useS_R(recipe.servings || 4);
  const [unit, setUnit] = useS_R("US");
  const [checked, setChecked] = useS_R(() => new Set());
  const [doneSteps, setDoneSteps] = useS_R(() => new Set());
  const [cookMode, setCookMode] = useS_R(false);
  const [activeStep, setActiveStep] = useS_R(0);

  const scale = servings / (recipe.servings || 4);

  const toggleIng = (i) => {
    const n = new Set(checked); n.has(i) ? n.delete(i) : n.add(i); setChecked(n);
  };
  const toggleStep = (i) => {
    const n = new Set(doneSteps); n.has(i) ? n.delete(i) : n.add(i); setDoneSteps(n);
  };

  const ings = recipe.ingredients || [];
  const steps = recipe.steps || [];

  return (
    <main>
      {/* ——— Spec sheet header ——— */}
      <section style={{padding:"40px 24px 0"}}>
        <button onClick={onBack} className="mono" style={{fontSize:11, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.08em"}}>
          ← Back to index
        </button>

        <div style={{
          marginTop:24,
          display:"grid",
          gridTemplateColumns:"1fr auto",
          gap:32,
          alignItems:"start",
          paddingBottom:22,
          borderBottom:"1px solid var(--ink)"
        }}>
          <div>
            <div className="mono" style={{fontSize:11, color:"var(--accent-ink)", letterSpacing:"0.1em", textTransform:"uppercase"}}>
              § Recipe · No. 00142 · Ed. 3
            </div>
            <h1 className="serif" style={{
              fontSize:"clamp(56px, 7vw, 96px)",
              fontStyle:"italic",
              letterSpacing:"-0.02em",
              lineHeight:0.95,
              margin:"12px 0 18px",
              fontWeight:400
            }}>
              {recipe.title}
            </h1>
            <div style={{fontSize:17, color:"var(--ink-2)", maxWidth:640, lineHeight:1.5}}>
              {recipe.summary}
            </div>
            <div style={{display:"flex", gap:8, marginTop:18, flexWrap:"wrap"}}>
              {recipe.tags?.map(t => (
                <span key={t} className="mono" style={{fontSize:10, padding:"4px 8px", border:"1px solid var(--rule-2)", color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.06em"}}>{t}</span>
              ))}
            </div>
          </div>

          <div style={{
            border:"1px solid var(--ink)",
            padding:"16px 20px",
            minWidth:300,
            fontFamily:"var(--mono)"
          }}>
            <div style={{fontSize:10, textTransform:"uppercase", letterSpacing:"0.1em", color:"var(--ink-3)"}}>
              Filed under
            </div>
            <div style={{fontSize:13, marginTop:4}}>
              Dinner / Poultry / Weeknight
            </div>
            <div style={{marginTop:14, paddingTop:12, borderTop:"1px dashed var(--rule-2)", fontSize:12, color:"var(--ink-2)", lineHeight:1.8}}>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>Rating</span><span>★ {recipe.rating} / 5</span></div>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>Reviews</span><span>{recipe.reviews?.toLocaleString()}</span></div>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>Difficulty</span><span>{"●".repeat(recipe.difficulty||1)}{"○".repeat(5-(recipe.difficulty||1))}</span></div>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>Source</span><span style={{color:"var(--ink)"}}>Tested in-house →</span></div>
            </div>
          </div>
        </div>

        {/* Stat rail */}
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(6, 1fr)",
          padding:"16px 0",
          borderBottom:"1px solid var(--rule)",
        }}>
          <Stat k="Total" v={recipe.time} sub="min"/>
          <Stat k="Active" v={recipe.active} sub="min"/>
          <Stat k="Servings" v={servings}/>
          <Stat k="Per serving" v={Math.round(recipe.calories/recipe.servings*servings)} sub="kcal"/>
          <Stat k="Ingredients" v={ings.length}/>
          <Stat k="Steps" v={steps.length}/>
        </div>
      </section>

      {/* ——— Controls bar ——— */}
      <section style={{
        position:"sticky", top: 99, zIndex:10,
        background:"var(--bg)",
        borderBottom:"1px solid var(--rule)",
        padding:"14px 24px",
        display:"flex", gap:20, alignItems:"center", flexWrap:"wrap"
      }}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span className="caps" style={{color:"var(--ink-3)"}}>Servings</span>
          <div style={{display:"flex", alignItems:"center", border:"1px solid var(--rule-2)"}}>
            <button onClick={()=>setServings(Math.max(1,servings-1))} className="mono" style={{padding:"6px 10px", borderRight:"1px solid var(--rule-2)"}}>−</button>
            <span className="mono" style={{padding:"6px 14px", minWidth:36, textAlign:"center"}}>{servings}</span>
            <button onClick={()=>setServings(servings+1)} className="mono" style={{padding:"6px 10px", borderLeft:"1px solid var(--rule-2)"}}>+</button>
          </div>
        </div>

        <div style={{display:"flex", alignItems:"center", gap:8}}>
          <span className="caps" style={{color:"var(--ink-3)"}}>Units</span>
          <div style={{display:"flex"}}>
            {["US","Metric"].map(u => (
              <button key={u} onClick={()=>setUnit(u)} className="mono" style={{
                fontSize:11, padding:"6px 10px",
                border:"1px solid var(--rule-2)",
                background: unit===u ? "var(--ink)" : "transparent",
                color: unit===u ? "var(--bg)" : "var(--ink-2)",
                marginLeft:-1
              }}>{u}</button>
            ))}
          </div>
        </div>

        <div style={{flex:1}}/>

        <button className="mono" style={{fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", padding:"8px 12px", border:"1px solid var(--rule-2)"}}>＋ Save</button>
        <button className="mono" style={{fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", padding:"8px 12px", border:"1px solid var(--rule-2)"}}>↓ Shopping list</button>
        <button className="mono" style={{fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", padding:"8px 12px", border:"1px solid var(--rule-2)"}}>⎙ Print</button>
        <button onClick={()=>{setCookMode(true); setActiveStep(0);}} className="mono" style={{
          fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em",
          padding:"8px 14px", background:"var(--accent)", color:"#fff", border:"1px solid var(--accent)"
        }}>▶ Cook mode</button>
      </section>

      {/* ——— Two-column body: ingredients | method ——— */}
      <section style={{
        display:"grid",
        gridTemplateColumns:"380px 1fr",
        padding:"40px 24px",
        gap:48,
        borderBottom:"1px solid var(--rule)",
        alignItems:"start"
      }}>
        {/* Ingredients */}
        <aside style={{position:"sticky", top: 170}}>
          <div className="caps" style={{color:"var(--ink-3)", marginBottom:16}}>— Ingredients · {ings.length}</div>
          <ul style={{margin:0, padding:0, listStyle:"none"}}>
            {ings.map((ing, i) => {
              const ck = checked.has(i);
              const qty = ing.qty ? formatQty(ing.qty * scale, unit, ing.unit) : "";
              return (
                <li key={i} onClick={()=>toggleIng(i)} style={{
                  display:"grid", gridTemplateColumns:"20px 72px 1fr", gap:12,
                  padding:"10px 0",
                  borderTop:"1px solid var(--rule)",
                  cursor:"pointer",
                  color: ck ? "var(--ink-3)" : "var(--ink)",
                  textDecoration: ck ? "line-through" : "none"
                }}>
                  <div style={{
                    width:16, height:16, marginTop:3,
                    border:"1px solid " + (ck ? "var(--ink-3)":"var(--ink)"),
                    background: ck ? "var(--ink-3)" : "transparent",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color:"var(--bg)"
                  }}>{ck && "✓"}</div>
                  <div className="mono" style={{fontSize:13, color: ck ? "var(--ink-3)" : "var(--accent-ink)"}}>
                    {qty}{ing.unit ? " "+ing.unit : ""}
                  </div>
                  <div style={{fontSize:15}}>
                    {ing.item}
                    {ing.note && <span style={{color:"var(--ink-3)", fontSize:12, marginLeft:6}}>({ing.note})</span>}
                  </div>
                </li>
              );
            })}
          </ul>

          {recipe.equipment && (
            <div style={{marginTop:28}}>
              <div className="caps" style={{color:"var(--ink-3)", marginBottom:10}}>— Equipment</div>
              <ul style={{margin:0, padding:0, listStyle:"none", fontSize:13}}>
                {recipe.equipment.map(e => (
                  <li key={e} style={{padding:"6px 0", borderTop:"1px solid var(--rule)"}}>{e}</li>
                ))}
              </ul>
            </div>
          )}
        </aside>

        {/* Steps */}
        <div>
          {showImagery && (
            <div style={{marginBottom:28}}>
              <FoodPlaceholder label={recipe.title + " · finished dish"} ratio="16/9"/>
            </div>
          )}

          <div className="caps" style={{color:"var(--ink-3)", marginBottom:16}}>— Method · {steps.length} steps · timeline</div>

          {/* Timeline */}
          <div style={{position:"relative", marginBottom:32, paddingLeft:8}}>
            <div style={{height:6, background:"var(--bg-2)", border:"1px solid var(--rule-2)", position:"relative"}}>
              {steps.map((s, i) => {
                const pct = (s.t / recipe.time) * 100;
                return (
                  <div key={i} style={{
                    position:"absolute", left: `${pct}%`, top:-5, width:2, height:16,
                    background: doneSteps.has(i) ? "var(--accent)" : "var(--ink-2)"
                  }}/>
                );
              })}
            </div>
            <div style={{display:"flex", justifyContent:"space-between", marginTop:6, fontFamily:"var(--mono)", fontSize:10, color:"var(--ink-3)"}}>
              <span>t=0</span>
              <span>t={Math.round(recipe.time/2)}min</span>
              <span>t={recipe.time}min</span>
            </div>
          </div>

          <ol style={{margin:0, padding:0, listStyle:"none"}}>
            {steps.map((s, i) => {
              const done = doneSteps.has(i);
              return (
                <li key={i} style={{
                  display:"grid",
                  gridTemplateColumns:"60px 60px 1fr auto",
                  gap:20,
                  padding:"20px 0",
                  borderTop: "1px solid var(--rule)",
                  opacity: done ? 0.5 : 1
                }}>
                  <div className="mono" style={{fontSize:11, color:"var(--ink-3)", letterSpacing:"0.06em"}}>STEP</div>
                  <div className="serif" style={{fontSize:36, letterSpacing:"-0.01em", lineHeight:1, color: done?"var(--ink-3)":"var(--ink)", fontStyle:"italic"}}>
                    {String(i+1).padStart(2,"0")}
                  </div>
                  <div>
                    <div style={{fontSize:17, lineHeight:1.5, color: done ? "var(--ink-3)" : "var(--ink)", textDecoration: done ? "line-through" : "none"}}>
                      {s.text}
                    </div>
                    <div className="mono" style={{fontSize:11, color:"var(--ink-3)", marginTop:6, letterSpacing:"0.06em", textTransform:"uppercase"}}>
                      starts at t+{s.t}min
                    </div>
                  </div>
                  <button onClick={()=>toggleStep(i)} className="mono" style={{
                    fontSize:10, alignSelf:"start", marginTop:4,
                    padding:"6px 8px",
                    border:"1px solid " + (done ? "var(--accent)":"var(--rule-2)"),
                    color: done ? "var(--accent)" : "var(--ink-2)",
                    textTransform:"uppercase", letterSpacing:"0.08em"
                  }}>{done ? "✓ done" : "mark done"}</button>
                </li>
              );
            })}
          </ol>

          {recipe.why && (
            <div style={{
              marginTop:32, padding:"20px 22px",
              border:"1px solid var(--ink)",
              background:"var(--bg-2)",
            }}>
              <div className="caps" style={{color:"var(--accent-ink)", marginBottom:10}}>◆ Why this works</div>
              <div style={{fontSize:15, color:"var(--ink-2)", lineHeight:1.55}}>{recipe.why}</div>
            </div>
          )}
        </div>
      </section>

      {/* Nutrition + next */}
      <section style={{padding:"40px 24px", borderBottom:"1px solid var(--rule)", display:"grid", gridTemplateColumns:"1fr 1fr", gap:40}}>
        <div>
          <div className="caps" style={{color:"var(--ink-3)", marginBottom:14}}>— Nutrition · per serving (est.)</div>
          <div style={{display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:14}}>
            {[
              ["Calories", Math.round(recipe.calories), "kcal"],
              ["Protein", 38, "g"],
              ["Fat", 32, "g"],
              ["Carbs", 8, "g"],
              ["Sodium", 720, "mg"]
            ].map(([k,v,u]) => (
              <div key={k} style={{borderTop:"1px solid var(--ink)", paddingTop:8}}>
                <div className="mono" style={{fontSize:10, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.08em"}}>{k}</div>
                <div className="serif" style={{fontSize:28, lineHeight:1.1}}>{v}<span className="mono" style={{fontSize:11, color:"var(--ink-3)", marginLeft:4}}>{u}</span></div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="caps" style={{color:"var(--ink-3)", marginBottom:14}}>— Also from this index</div>
          <ul style={{margin:0, padding:0, listStyle:"none"}}>
            {window.__RECIPES__.slice(1,5).map(r => (
              <li key={r.id} style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", padding:"10px 0", borderTop:"1px solid var(--rule)"}}>
                <span className="serif" style={{fontSize:20, fontStyle:"italic"}}>{r.title}</span>
                <span className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>{r.time}m · ★{r.rating}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Cook mode overlay */}
      {cookMode && (
        <CookMode
          recipe={recipe}
          step={activeStep}
          setStep={setActiveStep}
          onClose={()=>setCookMode(false)}
        />
      )}
    </main>
  );
}

// —— format quantities simply; fractions for US ——
function formatQty(n, unit, recipeUnit) {
  if (n === 0) return "0";
  // Common fractions for US
  const frac = (x) => {
    const whole = Math.floor(x);
    const rem = x - whole;
    const fractions = [[0,""],[0.125,"⅛"],[0.25,"¼"],[0.333,"⅓"],[0.5,"½"],[0.667,"⅔"],[0.75,"¾"],[0.875,"⅞"]];
    let best = fractions[0], bestDiff = 1;
    for (const f of fractions) {
      const d = Math.abs(rem - f[0]);
      if (d < bestDiff) { bestDiff = d; best = f; }
    }
    if (bestDiff < 0.06) {
      if (whole === 0) return best[1] || "0";
      return (whole + (best[1] ? " "+best[1] : "")).trim();
    }
    return n.toFixed(2).replace(/\.?0+$/,"");
  };
  return frac(n);
}

// ——— Cook mode overlay ———
function CookMode({ recipe, step, setStep, onClose }) {
  const steps = recipe.steps || [];
  const s = steps[step];

  useE_R(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setStep(Math.min(steps.length-1, step+1));
      if (e.key === "ArrowLeft") setStep(Math.max(0, step-1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background:"var(--ink)",
      color:"var(--bg)",
      display:"grid",
      gridTemplateRows:"auto 1fr auto",
      padding:"32px 48px"
    }}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center"}}>
        <div className="mono" style={{fontSize:11, letterSpacing:"0.2em", textTransform:"uppercase", opacity:0.5}}>
          Cook Mode · {recipe.title}
        </div>
        <button onClick={onClose} className="mono" style={{fontSize:11, letterSpacing:"0.1em", textTransform:"uppercase", color:"var(--bg)"}}>✕ Exit (esc)</button>
      </div>

      <div style={{display:"flex", flexDirection:"column", justifyContent:"center", maxWidth:1000}}>
        <div className="mono" style={{fontSize:12, color:"var(--accent)", letterSpacing:"0.1em"}}>STEP {String(step+1).padStart(2,"0")} / {String(steps.length).padStart(2,"0")} · t+{s.t}min</div>
        <div className="serif" style={{fontSize:"clamp(56px, 8vw, 120px)", fontStyle:"italic", lineHeight:1.05, letterSpacing:"-0.02em", marginTop:14, color:"var(--bg)"}}>
          {s.text}
        </div>
        <div style={{marginTop:32, maxWidth:540, color:"oklch(0.7 0.01 60)", fontSize:15}}>
          {step < steps.length-1 ? <>Next: <span style={{color:"var(--bg)"}}>{steps[step+1].text.slice(0,80)}…</span></> : <>Final step. Plate and serve.</>}
        </div>
      </div>

      <div style={{display:"flex", justifyContent:"space-between", alignItems:"center", gap:20}}>
        <div style={{flex:1, height:2, background:"oklch(0.35 0.012 60)", position:"relative"}}>
          <div style={{position:"absolute", inset:0, background:"var(--accent)", width:`${((step+1)/steps.length)*100}%`}}/>
        </div>
        <div style={{display:"flex", gap:10}}>
          <button onClick={()=>setStep(Math.max(0,step-1))} className="mono" style={{fontSize:12, padding:"12px 20px", border:"1px solid oklch(0.4 0.01 60)", color:"var(--bg)", letterSpacing:"0.1em", textTransform:"uppercase"}}>← Prev</button>
          <button onClick={()=>setStep(Math.min(steps.length-1, step+1))} className="mono" style={{fontSize:12, padding:"12px 20px", background:"var(--accent)", color:"#fff", letterSpacing:"0.1em", textTransform:"uppercase"}}>Next →</button>
        </div>
      </div>
    </div>
  );
}

window.RecipePage = RecipePage;
