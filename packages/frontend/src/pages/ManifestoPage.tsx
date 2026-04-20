export default function ManifestoPage() {
  return (
    <main className="px-6 py-20 mx-auto" style={{ maxWidth: 900 }}>
      <div className="caps text-accent-ink mb-4">◆ Fig. 000 — Manifesto</div>
      <h1
        className="serif font-normal italic mb-10"
        style={{
          fontSize: "clamp(48px, 6vw, 84px)",
          lineHeight: 0.95,
          letterSpacing: "-0.02em",
        }}
      >
        We cut the bullshit.
      </h1>
      <div
        className="flex flex-col gap-5 text-ink-2"
        style={{ fontSize: 18, lineHeight: 1.6, maxWidth: 640 }}
      >
        <p>
          A recipe is a list of ingredients and a sequence of steps. Nothing
          more is required for dinner to happen.
        </p>
        <p>
          The modern internet disagrees. It wants you to scroll past a 900-word
          essay, a wedding anecdote, and three full-screen ads before you learn
          that the answer is, and has always been, chicken thighs.
        </p>
        <p>
          We don't do that. We index two million recipes and strip them to the
          part that actually makes dinner. We keep the name, the numbers, the
          ingredients, and the steps. We delete the rest.
        </p>
        <p>
          If the story matters, we'll tell it in four sentences, at the end, so
          you can skip it without scrolling.
        </p>
      </div>

      {/* ——— Why this is legal ——— */}
      <div className="mt-20 mb-20" style={{ maxWidth: 640 }}>
        <div className="caps text-accent-ink mb-4">◆ Fig. 001 — Why this is legal</div>
        <h2
          className="serif font-normal italic mb-6"
          style={{ fontSize: "clamp(32px, 4vw, 56px)", lineHeight: 1, letterSpacing: "-0.02em" }}
        >
          Recipes can't be copyrighted.
        </h2>
        <div className="flex flex-col gap-5 text-ink-2" style={{ fontSize: 18, lineHeight: 1.6 }}>
          <p>
            A recipe — the list of ingredients and the sequence of steps — is a statement of facts.
            Facts are not copyrightable. This has been affirmed by courts repeatedly, including in{" "}
            <em>Publications International v. Meredith Corp.</em> (1996) and by the U.S. Copyright Office itself.
          </p>
          <p>
            What <em>is</em> copyrightable is the creative expression surrounding a recipe: the personal
            essay, the photographs, the specific literary flourishes in how steps are described. We don't
            take any of that. We extract the factual content — ingredients, quantities, and method — and
            discard the rest.
          </p>
          <p>
            Every recipe on this site is extracted from{" "}
            <a
              href="https://schema.org/Recipe"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--accent-ink)" }}
            >
              Schema.org Recipe
            </a>{" "}
            structured data that publishers voluntarily embed in their pages specifically for machine
            consumption. This is the same data that Google, Pinterest, and every other search engine
            reads. Publishers add it because they want their recipes to appear in search results.
          </p>
          <p>
            We also:
          </p>
          <ul className="list-none flex flex-col gap-3 mono" style={{ fontSize: 14 }}>
            <li>→ Respect every site's <code>robots.txt</code> — if they say don't crawl, we don't</li>
            <li>→ Link back to the original source on every recipe</li>
            <li>→ Honour removal requests within 24 hours</li>
            <li>→ Never reproduce copyrighted photographs — we use the image URL the publisher provides in their structured data, or none at all</li>
            <li>→ Rate-limit our crawler to avoid placing load on source servers</li>
          </ul>
          <p>
            If you're a publisher and want your recipes removed, visit our{" "}
            <a href="/remove" className="underline" style={{ color: "var(--accent-ink)" }}>
              removal request page
            </a>
            . We'll take them down, no questions asked.
          </p>
        </div>
      </div>

      {/* ——— Stats grid ——— */}
      <div
        className="mt-14 grid border"
        style={{
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          background: "var(--rule-2)",
          borderColor: "var(--rule-2)",
        }}
      >
        {[
          ["Words removed", "184M"],
          ["Ads bypassed", "14,201"],
          ["Scrolls saved", "≈ 9 km"],
          ["Avg. time to ingredients", "0.4 s"],
          ["Avg. recipe length", "182 words"],
          ["Stories per recipe", "0"],
        ].map(([label, value]) => (
          <div key={label} className="bg-bg p-6">
            <div className="caps text-ink-3">{label}</div>
            <div
              className="serif italic mt-1"
              style={{ fontSize: 48, lineHeight: 1.1 }}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
