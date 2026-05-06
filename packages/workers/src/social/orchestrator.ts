import { ulid } from '@rr/social-shared';
import { createNotifier } from '@rr/notifier';

interface Env {
  DB: D1Database;
  RR_SOCIAL_KILLSWITCH: KVNamespace;
  SOCIAL_SIGNALS_ROLLUP?: Fetcher;
  SOCIAL_SELECTOR?: Fetcher;
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
  NOTIFIER_CHANNEL?: 'email';
}

interface RunResult { candidatesEmitted: number; draftsCreated: number }

async function runScheduled(env: Env): Promise<void> {
  const runId = ulid();
  const startedAt = Date.now();

  const killswitchValue = await env.RR_SOCIAL_KILLSWITCH.get('global');
  if (killswitchValue) {
    console.log(`SOCIAL_ORCHESTRATOR ${runId}: killswitch (${killswitchValue}); aborting`);
    await insertRun(env, { runId, startedAt, status: 'killswitch', error: killswitchValue });
    await createNotifier(env).sendAlert({
      level: 'warn',
      subject: 'Social orchestrator skipped: killswitch active',
      body: `Reason: ${killswitchValue}\nRun id: ${runId}`,
    });
    return;
  }

  await insertRun(env, { runId, startedAt, status: 'running' });

  try {
    if (env.SOCIAL_SIGNALS_ROLLUP) {
      const r = await env.SOCIAL_SIGNALS_ROLLUP.fetch('https://internal/run', { method: 'POST' });
      if (!r.ok) throw new Error(`signals-rollup ${r.status}: ${await r.text()}`);
    } else {
      console.log(`SOCIAL_ORCHESTRATOR ${runId}: SOCIAL_SIGNALS_ROLLUP not bound; skipping`);
    }

    let result: RunResult = { candidatesEmitted: 0, draftsCreated: 0 };
    if (env.SOCIAL_SELECTOR) {
      const r = await env.SOCIAL_SELECTOR.fetch('https://internal/run', { method: 'POST' });
      if (!r.ok) throw new Error(`selector ${r.status}: ${await r.text()}`);
      result = (await r.json()) as RunResult;
    } else {
      console.log(`SOCIAL_ORCHESTRATOR ${runId}: SOCIAL_SELECTOR not bound; skipping`);
    }

    await env.DB.prepare(`
      UPDATE social_orchestrator_runs
      SET finished_at = ?, status = 'completed',
          candidates_emitted = ?, drafts_created = ?
      WHERE id = ?
    `).bind(Date.now(), result.candidatesEmitted, result.draftsCreated, runId).run();

    console.log(`SOCIAL_ORCHESTRATOR ${runId}: done. candidates=${result.candidatesEmitted}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`SOCIAL_ORCHESTRATOR ${runId}: failed:`, message);
    await env.DB.prepare(`
      UPDATE social_orchestrator_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?
    `).bind(Date.now(), message, runId).run();
    await createNotifier(env).sendAlert({
      level: 'error',
      subject: 'Social orchestrator run failed',
      body: `Run id: ${runId}\nError: ${message}`,
    });
    throw err;
  }
}

async function insertRun(env: Env, args: {
  runId: string; startedAt: number;
  status: 'running' | 'completed' | 'failed' | 'killswitch'; error?: string;
}) {
  await env.DB.prepare(`
    INSERT INTO social_orchestrator_runs (id, started_at, status, error)
    VALUES (?, ?, ?, ?)
  `).bind(args.runId, args.startedAt, args.status, args.error ?? null).run();
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env));
  },
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && req.method === 'POST') {
      try { await runScheduled(env); return new Response('OK\n', { status: 200 }); }
      catch (err) { return new Response(`Error: ${(err as Error).message}\n`, { status: 500 }); }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
