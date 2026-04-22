import { useFunding } from "../hooks/useFunding";
import { Rule, Stat } from "../components/design-system";

const COST_LABELS: Record<string, string> = {
  d1_reads: "D1 Database reads",
  workers_ai: "Workers AI (translation & inference)",
  queues: "Queue operations",
  kv: "KV storage & reads",
  durable_objects: "Durable Objects (shopping lists)",
  r2: "R2 image storage",
  workers_base: "Workers Paid plan",
  other: "Other",
};

export default function TransparencyPage() {
  const { funding, isLoading } = useFunding();

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="mono" style={{ color: "var(--ink-3)", fontSize: 12 }}>
          Loading&hellip;
        </div>
      </div>
    );
  }

  const cost = funding?.monthly_cost ?? 0;
  const funded = funding?.funded_this_month ?? 0;
  const pct = cost > 0 ? Math.min(Math.round((funded / cost) * 100), 100) : 0;
  const barWidth = cost > 0 ? Math.min((funded / cost) * 100, 100) : 0;
  const breakdown = funding?.cost_breakdown;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 0" }}>
      <div className="caps" style={{ color: "var(--accent-ink)", marginBottom: 16 }}>
        ◆ Transparency
      </div>
      <h1 className="serif" style={{ fontSize: 40, margin: "0 0 16px", lineHeight: 1 }}>
        Running Costs
      </h1>
      <p style={{ fontSize: 15, color: "var(--ink-2)", maxWidth: 520, marginBottom: 40, lineHeight: 1.6 }}>
        ReducedRecipes is a passion project. No ads, no tracking, no premium tier.
        This page shows exactly what it costs to run and how much has been funded
        by the community.
      </p>

      {/* Funding progress */}
      <div style={{ padding: "24px", border: "1px solid var(--rule-2)", background: "var(--bg-2)", marginBottom: 40 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24, marginBottom: 20 }}>
          <Stat k="Monthly cost" v={`$${cost.toFixed(2)}`} />
          <Stat k="Funded this month" v={`$${funded.toFixed(2)}`} />
          <Stat k="Progress" v={`${pct}%`} />
        </div>
        <div style={{ height: 6, background: "var(--rule)", width: "100%", marginBottom: 16 }}>
          <div style={{ height: 6, background: funded >= cost ? "var(--accent)" : "var(--ink)", width: `${barWidth}%`, transition: "width 0.5s ease" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <a
            href="https://ko-fi.com/B0B51JEVN"
            target="_blank"
            rel="noopener noreferrer"
            className="mono"
            style={{
              fontSize: 12,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              padding: "12px 20px",
              background: "var(--ink)",
              color: "var(--bg)",
              border: "1px solid var(--ink)",
            }}
          >
            Buy me a coffee
          </a>
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-3)" }}>
            All-time: ${(funding?.funded_all_time ?? 0).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Cost breakdown */}
      {breakdown && (
        <>
          <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
            {breakdown.month} Breakdown
          </div>
          <div>
            {(Object.keys(COST_LABELS) as string[]).map((key) => {
              const value = (breakdown as unknown as Record<string, number>)[key] ?? 0;
              if (value === 0 && key !== "workers_base") return null;
              const pctOfTotal = cost > 0 ? Math.round((value / cost) * 100) : 0;
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 0",
                    borderBottom: "1px solid var(--rule)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, color: "var(--ink)" }}>
                      {COST_LABELS[key]}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        height: 3,
                        width: `${Math.max(pctOfTotal, 2)}%`,
                        maxWidth: 200,
                        background: "var(--ink-3)",
                      }}
                    />
                  </div>
                  <div className="mono" style={{ fontSize: 14, color: "var(--ink)" }}>
                    ${value.toFixed(2)}
                  </div>
                </div>
              );
            })}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "14px 0",
                borderBottom: "1px solid var(--rule)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>Total</div>
              <div className="mono" style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>
                ${cost.toFixed(2)}
              </div>
            </div>
            {breakdown.notes && (
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 12 }}>
                {breakdown.notes}
              </div>
            )}
          </div>
        </>
      )}

      {/* Recent donations */}
      <div style={{ marginTop: 40 }}>
        <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
          Recent supporters
        </div>
        {(funding?.recent_donations ?? []).length === 0 ? (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 14 }}>
            No donations yet. Be the first!
          </div>
        ) : (
          <div>
            {funding!.recent_donations.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  padding: "10px 0",
                  borderBottom: "1px solid var(--rule)",
                }}
              >
                <div>
                  <span style={{ fontSize: 14, color: "var(--ink)" }}>
                    {d.name}
                  </span>
                  {d.message && (
                    <span style={{ fontSize: 13, color: "var(--ink-2)", marginLeft: 10, fontStyle: "italic" }}>
                      "{d.message}"
                    </span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: 12, color: "var(--accent-ink)" }}>
                  ${d.amount.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Infrastructure info */}
      <div style={{ marginTop: 40, marginBottom: 40 }}>
        <div className="caps" style={{ color: "var(--ink-3)", marginBottom: 16 }}>
          Infrastructure
        </div>
        <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.6, maxWidth: 520, marginBottom: 24 }}>
          ReducedRecipes runs entirely on Cloudflare&rsquo;s edge network: Workers for compute,
          D1 for the database, KV for caching, Queues for the crawl pipeline, and Workers AI
          for translation and dietary inference. No traditional servers, no AWS bills.
        </p>
        <img
          src="/arch-diagram.png"
          alt="ReducedRecipes system architecture"
          style={{ width: "100%", border: "1px solid var(--rule-2)" }}
        />
      </div>
    </main>
  );
}
