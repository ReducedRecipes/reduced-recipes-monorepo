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
