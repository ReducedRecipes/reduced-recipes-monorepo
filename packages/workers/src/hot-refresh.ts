import type { Env } from '@rr/shared/env';

const DEFAULT_DECAY_SECONDS = 90000;
const DEFAULT_EPOCH = 1704067200; // 2024-01-01T00:00:00Z

async function runHotRefresh(env: Env) {
  const decaySeconds = parseFloat(env.HOT_DECAY_SECONDS ?? String(DEFAULT_DECAY_SECONDS));
  const epoch = parseFloat(env.HOT_EPOCH ?? String(DEFAULT_EPOCH));

  await env.DB.prepare(`
    UPDATE recipes
    SET hot_score =
      LOG10(MAX(vote_count, 1)) +
      (CAST(strftime('%s', COALESCE(first_voted_at, extracted_at)) AS REAL) - ?) / ?
    WHERE vote_count > 0
  `).bind(epoch, decaySeconds).run();
}

export default {
  scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    return runHotRefresh(env);
  },
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === '/trigger') {
      try {
        await runHotRefresh(env);
        return new Response('OK — hot-refresh triggered');
      } catch (err) {
        return new Response(`Error: ${(err as Error).message}\n${(err as Error).stack}`, { status: 500 });
      }
    }
    return new Response('Not found', { status: 404 });
  },
};
