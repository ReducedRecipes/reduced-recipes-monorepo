/**
 * Daily billing cron worker.
 *
 * Runs once per day, queries the Cloudflare GraphQL Analytics API
 * for month-to-date usage, computes costs, and upserts into the
 * funding DB so the transparency page stays current.
 */

interface BillingEnv {
  FUNDING_DB: D1Database;
  CF_API_TOKEN: string;
  CF_ACCOUNT_ID: string;
}

/** Cloudflare pricing constants (as of 2026-04). */
const PRICING = {
  // D1
  d1_rows_read_free: 25_000_000_000,   // 25B included
  d1_rows_read_per_m: 0.001,            // $0.001 per million
  d1_rows_written_free: 50_000_000,     // 50M included
  d1_rows_written_per_m: 1.0,           // $1.00 per million

  // Workers AI — $0.011 per 1K neurons
  ai_neurons_free: 10_000,              // 10K/day free = ~300K/month
  ai_per_1k_neurons: 0.011,

  // KV — reads $0.50/M, writes $5/M (reads dominate)
  kv_reads_free: 10_000_000,
  kv_reads_per_m: 0.50,

  // Queues — $0.40 per million
  queues_free: 1_000_000,
  queues_per_m: 0.40,

  // Workers base plan
  workers_base: 5.00,
};

interface GraphQLResponse {
  data: {
    viewer: {
      accounts: Array<{
        d1: Array<{ sum: { rowsRead: number; rowsWritten: number } }>;
        ai: Array<{ sum: { totalNeurons: number } }>;
        kv: Array<{ sum: { requests: number } }>;
        queues: Array<{ sum: { billableOperations: number } }>;
      }>;
    };
  } | null;
  errors: Array<{ message: string }> | null;
}

async function fetchUsage(env: BillingEnv, monthStart: string, today: string): Promise<GraphQLResponse> {
  const query = `{
    viewer {
      accounts(filter: {accountTag: "${env.CF_ACCOUNT_ID}"}) {
        d1: d1AnalyticsAdaptiveGroups(limit: 1, filter: {date_geq: "${monthStart}", date_leq: "${today}"}) {
          sum { rowsRead rowsWritten }
        }
        ai: aiInferenceAdaptiveGroups(limit: 1, filter: {date_geq: "${monthStart}", date_leq: "${today}"}) {
          sum { totalNeurons }
        }
        kv: kvOperationsAdaptiveGroups(limit: 1, filter: {date_geq: "${monthStart}", date_leq: "${today}"}) {
          sum { requests }
        }
        queues: queueMessageOperationsAdaptiveGroups(limit: 1, filter: {date_geq: "${monthStart}", date_leq: "${today}"}) {
          sum { billableOperations }
        }
      }
    }
  }`;

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  return res.json() as Promise<GraphQLResponse>;
}

function computeCosts(data: GraphQLResponse) {
  const account = data.data?.viewer?.accounts?.[0];
  if (!account) return null;

  const d1Reads = account.d1?.[0]?.sum?.rowsRead ?? 0;
  const d1Writes = account.d1?.[0]?.sum?.rowsWritten ?? 0;
  const neurons = account.ai?.[0]?.sum?.totalNeurons ?? 0;
  const kvOps = account.kv?.[0]?.sum?.requests ?? 0;
  const queueOps = account.queues?.[0]?.sum?.billableOperations ?? 0;

  const d1ReadCost = Math.max(0, (d1Reads - PRICING.d1_rows_read_free) / 1_000_000) * PRICING.d1_rows_read_per_m;
  const d1WriteCost = Math.max(0, (d1Writes - PRICING.d1_rows_written_free) / 1_000_000) * PRICING.d1_rows_written_per_m;
  const d1Cost = d1ReadCost + d1WriteCost;

  const aiCost = Math.max(0, neurons - PRICING.ai_neurons_free * 30) / 1_000 * PRICING.ai_per_1k_neurons;
  const kvCost = Math.max(0, (kvOps - PRICING.kv_reads_free) / 1_000_000) * PRICING.kv_reads_per_m;
  const queuesCost = Math.max(0, (queueOps - PRICING.queues_free) / 1_000_000) * PRICING.queues_per_m;

  return {
    d1_reads: round(d1Cost),
    workers_ai: round(aiCost),
    kv: round(kvCost),
    queues: round(queuesCost),
    durable_objects: 0,
    r2: 0,
    workers_base: PRICING.workers_base,
    other: 0,
    raw: { d1Reads, d1Writes, neurons, kvOps, queueOps },
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export default {
  async scheduled(_event: ScheduledEvent, env: BillingEnv, _ctx: ExecutionContext) {
    try {
      if (!env.CF_API_TOKEN || !env.CF_ACCOUNT_ID || !env.FUNDING_DB) {
        console.error('Billing cron: missing env bindings', {
          hasToken: !!env.CF_API_TOKEN,
          hasAccount: !!env.CF_ACCOUNT_ID,
          hasDB: !!env.FUNDING_DB,
        });
        return;
      }

      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const monthStart = `${month}-01`;
      const today = now.toISOString().split('T')[0]!;

      console.log(`Billing cron: fetching usage for ${monthStart} to ${today}`);

      const usage = await fetchUsage(env, monthStart, today);

      if (usage.errors) {
        console.error('GraphQL errors:', JSON.stringify(usage.errors));
        return;
      }

      const costs = computeCosts(usage);
      if (!costs) {
        console.error('Billing cron: no data returned from computeCosts');
        return;
      }

      const total = round(
        costs.d1_reads + costs.workers_ai + costs.kv + costs.queues +
        costs.durable_objects + costs.r2 + costs.workers_base + costs.other
      );

      const notes = `Auto-updated ${today} | D1: ${costs.raw.d1Reads} rows read, AI: ${Math.round(costs.raw.neurons)} neurons, KV: ${costs.raw.kvOps} ops, Queues: ${costs.raw.queueOps} ops`;

      await env.FUNDING_DB.prepare(
        `INSERT INTO monthly_costs (month, d1_reads, workers_ai, queues, kv, durable_objects, r2, workers_base, other, total, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(month) DO UPDATE SET
           d1_reads = excluded.d1_reads,
           workers_ai = excluded.workers_ai,
           queues = excluded.queues,
           kv = excluded.kv,
           durable_objects = excluded.durable_objects,
           r2 = excluded.r2,
           workers_base = excluded.workers_base,
           other = excluded.other,
           total = excluded.total,
           notes = excluded.notes,
           updated_at = datetime('now')`,
      ).bind(month, costs.d1_reads, costs.workers_ai, costs.queues, costs.kv, costs.durable_objects, costs.r2, costs.workers_base, costs.other, total, notes).run();

      console.log(`Billing cron: updated ${month} — total $${total}`);
    } catch (err) {
      console.error('Billing cron FAILED:', err);
    }
  },
};
