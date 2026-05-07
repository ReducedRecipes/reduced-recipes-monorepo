import type { Platform, RecipeRow } from '@rr/social-shared';
import { ulid } from '@rr/social-shared';
import { score, seasonalityMatch, longtailFreshness } from './selector.score';

interface Env {
  DB: D1Database;
  PINTEREST_QUEUE: Queue<{ candidateId: string }>;
  // Phase 2 producers — selector tolerates them being unbound until the
  // adapter-reels and adapter-shorts Workers ship.
  REELS_QUEUE?: Queue<{ candidateId: string }>;
  SHORTS_QUEUE?: Queue<{ candidateId: string }>;
}

const DAILY_TARGETS = { pinterest: 4, reels: 2, shorts: 2 } as const;

interface ThemeRow { theme: string; weight: number }

async function run(env: Env): Promise<{ candidatesEmitted: number; draftsCreated: 0 }> {
  const today = new Date();
  const todayYmd = today.toISOString().slice(0, 10);

  // 1. Active editorial themes today.
  const themes = await env.DB.prepare(`
    SELECT theme, weight FROM social_editorial_calendar
    WHERE start_date <= ? AND end_date >= ?
  `).bind(todayYmd, todayYmd).all<ThemeRow>();
  const themeMap = new Map(themes.results.map((t) => [t.theme, t.weight]));

  // 2. Candidate pool. Tags come from the recipe_tags junction table via
  // GROUP_CONCAT (NOT a JSON column on recipes — that schema doesn't exist).
  // recipes has no `difficulty` column; total_time is INTEGER minutes.
  const pool = await env.DB.prepare(`
    SELECT r.id, r.title, r.cuisine, r.total_time, r.hot_score, r.original_language,
           COALESCE(s.save_velocity_7d, 0) AS save_velocity_7d,
           COALESCE(s.search_volume_7d, 0) AS search_volume_7d,
           (SELECT GROUP_CONCAT(tag, ',')
            FROM recipe_tags WHERE recipe_id = r.id) AS tags_csv,
           (SELECT MAX(p.published_at)
            FROM social_posts p
            JOIN social_drafts d ON d.id = p.draft_id
            JOIN social_source_candidates c ON c.id = d.source_id
            WHERE c.recipe_id = r.id) AS last_featured_at
    FROM recipes r
    LEFT JOIN social_recipe_signals s ON s.recipe_id = r.id
    WHERE r.original_language IS NULL OR r.original_language = 'en'
    LIMIT 5000
  `).all<RecipeRow>();

  // 3. Score every candidate.
  const fourteenDaysMs = 14 * 86400_000;
  const scored = pool.results.map((r) => {
    const tags = (r.tags_csv ?? '').split(',').filter(Boolean);
    const seasonal = seasonalityMatch(tags, today);
    const editorial = computeEditorialMatch(tags, themeMap);
    const daysSince = r.last_featured_at
      ? (Date.now() - r.last_featured_at) / 86400_000
      : null;
    const longtail = longtailFreshness(daysSince);
    const recentlyPosted: 0 | 1 = r.last_featured_at && (Date.now() - r.last_featured_at) < fourteenDaysMs ? 1 : 0;

    const s = score({
      saveVelocity7d: r.save_velocity_7d,
      searchVolume7d: r.search_volume_7d,
      seasonalityMatch: seasonal,
      editorialThemeMatch: editorial,
      longtailFreshness: longtail,
      recentlyPosted,
    });
    return { recipe: r, s, reason: chooseReason(seasonal, editorial, r.save_velocity_7d) };
  });

  // 4. Sort and pick top N. Dedup across platforms — one hot recipe is
  // intentionally reused across pinterest/reels/shorts so the dominant
  // hero-image cost amortises across all three variants.
  const ranked = scored.sort((a, b) => b.s - a.s);

  const inserts: Array<{ id: string; recipe_id: string; reason: string; score: number; theme: string | null }> = [];
  const platformPicks: Record<Platform, string[]> = { pinterest: [], instagram: [], youtube: [], tiktok: [] };

  for (const { recipe, s, reason } of ranked) {
    const allFilled =
      platformPicks.pinterest.length >= DAILY_TARGETS.pinterest &&
      platformPicks.instagram.length >= DAILY_TARGETS.reels &&
      platformPicks.youtube.length >= DAILY_TARGETS.shorts;
    if (allFilled) break;

    const candidateId = ulid();
    inserts.push({ id: candidateId, recipe_id: recipe.id, reason, score: s, theme: pickPrimaryTheme(themeMap) });

    if (platformPicks.pinterest.length < DAILY_TARGETS.pinterest) platformPicks.pinterest.push(candidateId);
    if (platformPicks.instagram.length < DAILY_TARGETS.reels) platformPicks.instagram.push(candidateId);
    if (platformPicks.youtube.length < DAILY_TARGETS.shorts) platformPicks.youtube.push(candidateId);
  }

  if (inserts.length === 0) return { candidatesEmitted: 0, draftsCreated: 0 };

  // 5. Persist.
  const stmt = env.DB.prepare(`
    INSERT INTO social_source_candidates
      (id, recipe_id, selection_reason, selection_score, theme, selected_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const now = Date.now();
  await env.DB.batch(
    inserts.map((c) => stmt.bind(c.id, c.recipe_id, c.reason, c.score, c.theme, now)),
  );

  // 6. Enqueue. Phase-2 queues are no-op when unbound.
  if (platformPicks.pinterest.length) {
    await env.PINTEREST_QUEUE.sendBatch(
      platformPicks.pinterest.map((candidateId) => ({ body: { candidateId }, contentType: 'json' as const })),
    );
  }
  if (env.REELS_QUEUE && platformPicks.instagram.length) {
    await env.REELS_QUEUE.sendBatch(
      platformPicks.instagram.map((candidateId) => ({ body: { candidateId }, contentType: 'json' as const })),
    );
  }
  if (env.SHORTS_QUEUE && platformPicks.youtube.length) {
    await env.SHORTS_QUEUE.sendBatch(
      platformPicks.youtube.map((candidateId) => ({ body: { candidateId }, contentType: 'json' as const })),
    );
  }

  console.log(`SOCIAL_SELECTOR: ${inserts.length} candidates, pinterest=${platformPicks.pinterest.length}`);
  return { candidatesEmitted: inserts.length, draftsCreated: 0 };
}

function computeEditorialMatch(tags: string[], themeMap: Map<string, number>): number {
  const tagToTheme: Record<string, string> = {
    weeknight: 'weeknight_dinners',
    '30-minute': 'weeknight_dinners',
    'meal-prep': 'meal_prep_sunday',
    indulgent: 'comfort_food_or_indulgence',
    comfort: 'comfort_food_or_indulgence',
    festive: 'festive_holiday',
    summer: 'summer_freshness',
    'no-bake': 'summer_freshness',
    cookout: 'cookout_weeknights',
  };
  let best = 0;
  for (const tag of tags) {
    const theme = tagToTheme[tag.toLowerCase()];
    if (!theme) continue;
    const w = themeMap.get(theme);
    if (w !== undefined) best = Math.max(best, w);
  }
  return Math.min(1, best);
}

function chooseReason(seasonal: number, editorial: number, saves: number): 'trending' | 'seasonal' | 'editorial' | 'longtail' {
  if (saves > 0.7) return 'trending';
  if (seasonal > 0.5) return 'seasonal';
  if (editorial > 0.5) return 'editorial';
  return 'longtail';
}

function pickPrimaryTheme(themeMap: Map<string, number>): string | null {
  let best: { theme: string; weight: number } | null = null;
  for (const [theme, weight] of themeMap) {
    if (!best || weight > best.weight) best = { theme, weight };
  }
  return best?.theme ?? null;
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run' && req.method === 'POST') {
      try {
        return Response.json(await run(env));
      } catch (err) {
        return new Response(`Error: ${(err as Error).message}`, { status: 500 });
      }
    }
    if (url.pathname === '/health') return new Response('OK', { status: 200 });
    return new Response('Not found', { status: 404 });
  },
};
