// Homepage — the index
const { useState: useS_Home, useMemo: useM_Home } = React;

function Home({ onOpenRecipe, showImagery }) {
  const recipes = window.__RECIPES__;
  const byId = useM_Home(() => Object.fromEntries(recipes.map(r=>[r.id,r])), [recipes]);
  const trending = window.__TRENDING_IDS__.map(id => byId[id]).filter(Boolean);
  const seasonal = window.__SEASONAL_IDS__.map(id => byId[id]).filter(Boolean);
  const fast = window.__FAST_IDS__.map(id => byId[id]).filter(Boolean);

  const [excluded, setExcluded] = useS_Home(["mushrooms"]);
  const [have, setHave] = useS_Home(["chicken","garlic","lemon"]);

  return (
    <main>

      {/* ——— Hero: manifesto + index counter + ingredient search ——— */}
      <section style={{
        padding:"60px 24px 40px",
        borderBottom:"1px solid var(--rule)",
        display:"grid",
        gridTemplateColumns:"1.2fr 1fr",
        gap:48
      }}>
        <div>
          <div className="caps" style={{color:"var(--accent-ink)", marginBottom:22}}>◆ Fig. 001 — Manifesto</div>
          <h1 className="serif" style={{
            fontSize:"clamp(48px, 7vw, 110px)",
            lineHeight:0.95, letterSpacing:"-0.02em",
            margin:0, fontWeight:400
          }}>
            Recipes,<br/>
            <span style={{fontStyle:"italic"}}>reduced</span> to what<br/>
            you actually need.
          </h1>
          <div style={{marginTop:28, maxWidth:540, color:"var(--ink-2)", fontSize:16, lineHeight:1.55}}>
            No backstory about a trip to Tuscany. No ads between steps. No scroll
            to the bottom to find the ingredients. Just the list, the method, and
            the number of minutes until dinner.
          </div>

          <div style={{marginTop:32, display:"flex", gap:10}}>
            <button onClick={()=>onOpenRecipe("creamy-tuscan-chicken")} className="mono" style={{
              fontSize:12, textTransform:"uppercase", letterSpacing:"0.1em",
              padding:"14px 22px", background:"var(--ink)", color:"var(--bg)",
              border:"1px solid var(--ink)"
            }}>→ See a recipe</button>
            <button className="mono" style={{
              fontSize:12, textTransform:"uppercase", letterSpacing:"0.1em",
              padding:"14px 22px", background:"transparent", color:"var(--ink)",
              border:"1px solid var(--ink)"
            }}>Browse the index</button>
          </div>
        </div>

        {/* Stat panel */}
        <aside style={{
          border:"1px solid var(--rule-2)",
          padding:"24px 24px 20px",
          background:"var(--bg-2)",
          position:"relative",
          alignSelf:"end"
        }}>
          <div style={{
            position:"absolute", top:-10, left:16, background:"var(--bg)",
            padding:"0 8px"
          }} className="caps">§ Specimen 001</div>

          <div className="serif" style={{fontSize:82, lineHeight:1, letterSpacing:"-0.02em"}}>
            <Ticker value={2147381}/>
          </div>
          <div className="mono" style={{fontSize:11, color:"var(--ink-3)", textTransform:"uppercase", letterSpacing:"0.08em", marginTop:4}}>
            Recipes indexed · 0 filler words
          </div>

          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16, marginTop:28, paddingTop:18, borderTop:"1px solid var(--rule)"}}>
            <Stat k="Median read" v="180" sub="words"/>
            <Stat k="Avg. cook" v="32" sub="min"/>
            <Stat k="Ads removed" v="14,201"/>
          </div>

          <div style={{marginTop:22, paddingTop:18, borderTop:"1px solid var(--rule)"}}>
            <div className="caps" style={{color:"var(--ink-3)", marginBottom:10}}>Today's index</div>
            <div className="mono" style={{fontSize:12, lineHeight:1.85, color:"var(--ink-2)"}}>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>New this week</span><span>+412</span></div>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>Under 20 min</span><span>284,903</span></div>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>One-pan</span><span>91,220</span></div>
              <div style={{display:"flex", justifyContent:"space-between"}}><span>Vegetarian</span><span>612,881</span></div>
            </div>
          </div>
        </aside>
      </section>

      {/* ——— Ingredient-driven search ——— */}
      <section style={{padding:"36px 24px", borderBottom:"1px solid var(--rule)"}}>
        <Rule label="Fig. 002 — What's in your fridge" />
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:40, marginTop:20}}>
          <IngredientBoard
            title="Have"
            items={have}
            pool={window.__INGREDIENTS__}
            onAdd={(it)=>setHave([...have, it])}
            onRemove={(it)=>setHave(have.filter(x=>x!==it))}
          />
          <IngredientBoard
            title="Exclude"
            items={excluded}
            pool={window.__INGREDIENTS__}
            onAdd={(it)=>setExcluded([...excluded, it])}
            onRemove={(it)=>setExcluded(excluded.filter(x=>x!==it))}
            negative
          />
        </div>
        <div style={{marginTop:22, display:"flex", alignItems:"center", justifyContent:"space-between"}}>
          <div className="mono" style={{fontSize:12, color:"var(--ink-2)"}}>
            → <b>142,083</b> recipes match. <span style={{color:"var(--ink-3)"}}>Sorted by: fewest extra ingredients.</span>
          </div>
          <button className="mono" style={{
            fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em",
            padding:"10px 16px", background:"var(--accent)", color:"#fff",
            border:"1px solid var(--accent)"
          }}>Run query →</button>
        </div>
      </section>

      {/* ——— Featured (editorial two-column) ——— */}
      <section style={{padding:"48px 24px", borderBottom:"1px solid var(--rule)"}}>
        <div style={{display:"grid", gridTemplateColumns:"1.1fr 1fr", gap:40}}>
          <div>
            <div className="caps" style={{color:"var(--accent-ink)", marginBottom:14}}>◆ Fig. 003 — Feature of the week</div>
            <div className="serif" style={{fontSize:64, lineHeight:1, letterSpacing:"-0.015em", fontStyle:"italic"}}>
              Creamy Tuscan Chicken
            </div>
            <div style={{display:"flex", gap:24, marginTop:24, paddingTop:18, borderTop:"1px solid var(--rule)"}}>
              <Stat k="Total" v="25" sub="min"/>
              <Stat k="Active" v="15" sub="min"/>
              <Stat k="Servings" v="4"/>
              <Stat k="Rating" v="4.7" sub="/ 5"/>
              <Stat k="Reviews" v="1,842"/>
            </div>
            <div style={{marginTop:22, maxWidth:520, fontSize:15, color:"var(--ink-2)"}}>
              Chicken thighs in a cream-parmesan sauce with spinach and sun-dried
              tomatoes. Seven steps. One pan. No anecdote.
            </div>
            <div style={{marginTop:22, display:"flex", gap:8}}>
              <button onClick={()=>onOpenRecipe("creamy-tuscan-chicken")} className="mono" style={{
                fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em",
                padding:"12px 18px", background:"var(--ink)", color:"var(--bg)"
              }}>Open recipe →</button>
              <button className="mono" style={{
                fontSize:11, textTransform:"uppercase", letterSpacing:"0.1em",
                padding:"12px 18px", border:"1px solid var(--rule-2)"
              }}>＋ Save</button>
            </div>
          </div>
          <div>
            {showImagery
              ? <FoodPlaceholder label="Creamy Tuscan Chicken · skillet, overhead" ratio="4/3"/>
              : <TextHeroCard r={byId["creamy-tuscan-chicken"]}/>
            }
            <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", marginTop:12, fontFamily:"var(--mono)", fontSize:10, textTransform:"uppercase", color:"var(--ink-3)"}}>
              <span>01 · Sear</span><span>02 · Sauce</span><span>03 · Simmer</span><span>04 · Plate</span>
            </div>
          </div>
        </div>
      </section>

      {/* ——— Trending row ——— */}
      <RecipeShelf title="Fig. 004 — Trending this week" recipes={trending} onOpen={onOpenRecipe} showImagery={showImagery} rank/>

      {/* ——— Seasonal — editorial variation with numbered rows ——— */}
      <section style={{padding:"48px 24px", borderBottom:"1px solid var(--rule)", background:"var(--bg-2)"}}>
        <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:24}}>
          <div>
            <div className="caps" style={{color:"var(--accent-ink)", marginBottom:6}}>◆ Fig. 005</div>
            <div className="serif" style={{fontSize:48, letterSpacing:"-0.015em", fontStyle:"italic"}}>In season · April</div>
          </div>
          <div className="mono" style={{fontSize:12, color:"var(--ink-3)"}}>4 of 284 →</div>
        </div>
        <div style={{borderTop:"1px solid var(--rule-2)"}}>
          {seasonal.map((r,i) => (
            <button key={r.id} onClick={()=>onOpenRecipe(r.id)} style={{
              width:"100%", textAlign:"left",
              display:"grid",
              gridTemplateColumns:"50px 1.4fr 1fr 160px 120px 60px",
              gap:20, alignItems:"center",
              padding:"18px 0",
              borderBottom:"1px solid var(--rule-2)"
            }}
            onMouseEnter={e=>e.currentTarget.style.background="oklch(0.92 0.018 80)"}
            onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div className="mono" style={{fontSize:11, color:"var(--ink-3)"}}>{String(i+1).padStart(2,"0")}</div>
              <div className="serif" style={{fontSize:28, letterSpacing:"-0.01em"}}>{r.title}</div>
              <div style={{fontSize:13, color:"var(--ink-2)"}}>{r.summary}</div>
              <div style={{display:"flex", gap:6, flexWrap:"wrap"}}>
                {r.tags?.slice(0,3).map(t => (
                  <span key={t} className="mono" style={{fontSize:10, textTransform:"uppercase", padding:"3px 6px", border:"1px solid var(--rule-2)", color:"var(--ink-3)"}}>{t}</span>
                ))}
              </div>
              <div className="mono" style={{fontSize:12, color:"var(--ink-2)"}}>
                <div>{r.time} min · {r.servings} serv</div>
                <div style={{color:"var(--ink-3)"}}>★ {r.rating} ({r.reviews.toLocaleString()})</div>
              </div>
              <div className="mono" style={{fontSize:18, textAlign:"right", color:"var(--ink-3)"}}>→</div>
            </button>
          ))}
        </div>
      </section>

      {/* ——— Under 20 min — grid ——— */}
      <RecipeShelf title="Fig. 006 — Under 20 minutes" recipes={fast} onOpen={onOpenRecipe} showImagery={showImagery}/>

      {/* ——— Collections / browse CTAs ——— */}
      <section style={{padding:"60px 24px", borderBottom:"1px solid var(--rule)"}}>
        <Rule label="Fig. 007 — Browse by axis" />
        <div style={{display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:1, marginTop:20, background:"var(--rule-2)", border:"1px solid var(--rule-2)"}}>
          {[
            {k:"By time", items:["≤ 15 min","≤ 30 min","≤ 1 hr","All day"]},
            {k:"By diet", items:["Vegetarian","Vegan","Gluten-free","Keto"]},
            {k:"By method", items:["One-pan","Sheet-pan","Slow-cook","No-cook"]},
            {k:"By source", items:["Tested in-house","NYT","Bon Appétit","Reader submitted"]}
          ].map(col => (
            <div key={col.k} style={{background:"var(--bg)", padding:"22px 20px"}}>
              <div className="caps" style={{color:"var(--ink-3)", marginBottom:12}}>{col.k}</div>
              <ul style={{margin:0, padding:0, listStyle:"none"}}>
                {col.items.map(it => (
                  <li key={it} style={{
                    padding:"10px 0",
                    borderTop:"1px solid var(--rule)",
                    fontSize:15,
                    display:"flex", justifyContent:"space-between"
                  }}>
                    <span>{it}</span>
                    <span className="mono" style={{color:"var(--ink-3)", fontSize:11}}>→</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ——— Footer ——— */}
      <footer style={{padding:"40px 24px 28px", display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr", gap:40}}>
        <div>
          <div className="serif" style={{fontSize:28, fontStyle:"italic"}}>Reduced Recipes</div>
          <div className="mono" style={{fontSize:11, color:"var(--ink-3)", letterSpacing:"0.06em", textTransform:"uppercase", marginTop:6}}>
            Recipes, reduced. · © 2026
          </div>
          <div style={{marginTop:16, fontSize:13, color:"var(--ink-2)", maxWidth:420}}>
            An index of 2.1M recipes, cleaned of SEO sediment. No email capture.
            No "jump to recipe" button — you were always there.
          </div>
        </div>
        {[
          ["Index",["Browse","Search","Collections","Random"]],
          ["About",["Manifesto","How it works","Editors","Contact"]],
          ["Tools",["API","Shopping list","Meal plan","Newsletter"]]
        ].map(([title, items]) => (
          <div key={title}>
            <div className="caps" style={{color:"var(--ink-3)", marginBottom:14}}>{title}</div>
            <ul style={{margin:0, padding:0, listStyle:"none", display:"flex", flexDirection:"column", gap:8, fontSize:13}}>
              {items.map(x => <li key={x}>{x}</li>)}
            </ul>
          </div>
        ))}
      </footer>
    </main>
  );
}

function TextHeroCard({ r }) {
  if (!r) return null;
  return (
    <div style={{
      border:"1px solid var(--ink)",
      padding:"28px 26px",
      background:"var(--bg-2)",
      fontFamily:"var(--mono)",
      fontSize:12,
      lineHeight:1.75,
      minHeight:340
    }}>
      <div style={{color:"var(--ink-3)"}}>// {r.id}.recipe</div>
      <div style={{color:"var(--accent-ink)", marginTop:8}}>ingredients:</div>
      {r.ingredients?.slice(0,6).map((ing,i) => (
        <div key={i}>  <span style={{color:"var(--ink-3)"}}>{String(i+1).padStart(2,"0")}</span>  {ing.qty} {ing.unit} {ing.item}</div>
      ))}
      <div style={{color:"var(--accent-ink)", marginTop:10}}>method:</div>
      {r.steps?.slice(0,3).map((s,i) => (
        <div key={i} style={{color:"var(--ink-2)"}}>  → t+{s.t}min · {s.text.slice(0,48)}…</div>
      ))}
    </div>
  );
}

function RecipeShelf({ title, recipes, onOpen, showImagery, rank }) {
  return (
    <section style={{padding:"48px 24px", borderBottom:"1px solid var(--rule)"}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", marginBottom:24}}>
        <div>
          <div className="caps" style={{color:"var(--accent-ink)", marginBottom:6}}>◆ {title.split(" — ")[0]}</div>
          <div className="serif" style={{fontSize:40, letterSpacing:"-0.015em", fontStyle:"italic"}}>
            {title.split(" — ")[1]}
          </div>
        </div>
        <button className="mono" style={{fontSize:11, textTransform:"uppercase", letterSpacing:"0.08em", color:"var(--ink-2)"}}>See all →</button>
      </div>
      <div style={{display:"grid", gridTemplateColumns:`repeat(${Math.min(recipes.length, 6)}, 1fr)`, gap:20}}>
        {recipes.map((r,i) => (
          <button key={r.id} onClick={()=>onOpen(r.id)} style={{textAlign:"left", display:"flex", flexDirection:"column", gap:10}}>
            <div style={{position:"relative"}}>
              {showImagery
                ? <FoodPlaceholder label={r.title} ratio="1/1"/>
                : <TextThumb r={r}/>}
              {rank && (
                <div className="mono" style={{
                  position:"absolute", top:8, left:8,
                  background:"var(--ink)", color:"var(--bg)",
                  fontSize:10, padding:"3px 6px", letterSpacing:"0.08em"
                }}>{String(i+1).padStart(2,"0")}</div>
              )}
              <div className="mono" style={{
                position:"absolute", top:8, right:8,
                background:"var(--bg)", color:"var(--ink-2)",
                fontSize:10, padding:"3px 6px", border:"1px solid var(--rule-2)"
              }}>{r.time}m</div>
            </div>
            <div style={{display:"flex", flexDirection:"column", gap:4}}>
              <div className="serif" style={{fontSize:22, letterSpacing:"-0.01em", lineHeight:1.1}}>{r.title}</div>
              <div className="mono" style={{fontSize:11, color:"var(--ink-3)", letterSpacing:"0.04em", textTransform:"uppercase"}}>
                ★ {r.rating} · {r.reviews.toLocaleString()} rev · {r.servings} serv
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function TextThumb({ r }) {
  return (
    <div style={{
      aspectRatio:"1/1",
      border:"1px solid var(--rule-2)",
      padding:"14px 12px",
      background:"var(--bg-2)",
      fontFamily:"var(--mono)",
      fontSize:10,
      color:"var(--ink-3)",
      display:"flex", flexDirection:"column", justifyContent:"space-between"
    }}>
      <div>
        <div style={{textTransform:"uppercase", letterSpacing:"0.06em", color:"var(--accent-ink)"}}>§ {r.id}</div>
      </div>
      <div style={{color:"var(--ink)", fontFamily:"var(--serif)", fontSize:28, lineHeight:1, fontStyle:"italic"}}>
        {r.title.split(" ")[0]}<br/>
        <span style={{color:"var(--ink-3)"}}>{r.title.split(" ").slice(1).join(" ")}</span>
      </div>
      <div style={{display:"flex", justifyContent:"space-between"}}>
        <span>{r.time}m</span><span>n={r.reviews}</span>
      </div>
    </div>
  );
}

// ——— Ingredient board ———
function IngredientBoard({ title, items, pool, onAdd, onRemove, negative }) {
  const [q,setQ] = useS_Home("");
  const suggestions = pool.filter(p => !items.includes(p) && p.includes(q.toLowerCase())).slice(0,6);
  return (
    <div>
      <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:12}}>
        <div className="caps" style={{color: negative ? "var(--accent-ink)" : "var(--ink)"}}>
          {negative ? "— " : "+ "} {title} ({items.length})
        </div>
        <div className="mono" style={{fontSize:10, color:"var(--ink-3)"}}>
          {negative ? "Never suggest" : "Must include"}
        </div>
      </div>
      <div style={{
        minHeight:96,
        border:"1px solid var(--rule-2)",
        padding:10,
        display:"flex", flexWrap:"wrap", gap:6,
        alignContent:"flex-start"
      }}>
        {items.map(it => (
          <button key={it} onClick={()=>onRemove(it)} className="mono" style={{
            fontSize:11, padding:"6px 10px",
            background: negative ? "var(--accent)" : "var(--ink)",
            color: negative ? "#fff" : "var(--bg)",
            textTransform:"lowercase"
          }}>{it} ×</button>
        ))}
        <input value={q} onChange={e=>setQ(e.target.value)}
          placeholder={negative?"add an exclusion…":"add an ingredient…"}
          onKeyDown={e=>{
            if (e.key==="Enter" && q.trim()){ onAdd(q.trim().toLowerCase()); setQ(""); }
          }}
          style={{border:0, outline:"none", background:"transparent", flex:1, minWidth:140, fontSize:13, padding:"6px 4px"}}/>
      </div>
      {q && suggestions.length > 0 && (
        <div style={{marginTop:6, display:"flex", flexWrap:"wrap", gap:6}}>
          {suggestions.map(s => (
            <button key={s} onClick={()=>{onAdd(s); setQ("");}} className="mono" style={{
              fontSize:11, padding:"4px 8px", border:"1px dashed var(--rule-2)", color:"var(--ink-2)"
            }}>+ {s}</button>
          ))}
        </div>
      )}
    </div>
  );
}

window.Home = Home;
