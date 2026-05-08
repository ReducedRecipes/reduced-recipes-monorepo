import {
  ulid, formatTotalTime, type Platform, type RecipeDocument,
} from '@rr/social-shared';
import {
  SYSTEM_PROMPT, userPrompt, validate, PROMPT_VERSION, MODEL,
} from './adapter-pinterest.prompts';
import { composePin } from './adapter-pinterest.compose';

interface Env {
  AI: Ai;
  DB: D1Database;
  RECIPES_KV: KVNamespace;        // canonical RecipeDocument source
  RR_SOCIAL_ASSETS: R2Bucket;
  IMAGE_GEN: Fetcher;
}

interface JobBody { candidateId: string }

interface CandidateRow {
  candidate_id: string;
  recipe_id: string;
  theme: string | null;
}

async function processJob(env: Env, body: JobBody): Promise<void> {
  // 1. Candidate from D1.
  // NOTE: only id, recipe_id, theme — recipes table has no `tags` JSON
  // column and no `difficulty` column, so we don't JOIN those. Tags come
  // from the recipe_tags junction (selector's job, not ours).
  const candidate = await env.DB.prepare(`
    SELECT id AS candidate_id, recipe_id, theme
    FROM social_source_candidates WHERE id = ?
  `).bind(body.candidateId).first<CandidateRow>();
  if (!candidate) throw new Error(`candidate ${body.candidateId} not found`);

  // 2. Full recipe doc from KV (canonical for ingredients-with-quantities,
  // cuisine, total_time minutes).
  const docJson = await env.RECIPES_KV.get(`recipe:${candidate.recipe_id}`, 'text');
  if (!docJson) throw new Error(`RecipeDocument missing for ${candidate.recipe_id}`);
  const doc = JSON.parse(docJson) as RecipeDocument;

  // 3. Top 5 ingredients (raw, with quantities — Llama strips them).
  const topIngredients = (doc.ingredients ?? []).slice(0, 5);

  const draftId = ulid();
  const totalTimeFormatted = formatTotalTime(doc.total_time);

  // 4. Generate hero image (per-recipe, fresh).
  const heroResp = await env.IMAGE_GEN.fetch('https://internal/generate-recipe-shot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      slot: 'hero',
      recipe: { title: doc.title, cuisine: doc.cuisine },
      draftId,
    }),
  });
  if (!heroResp.ok) {
    const detail = await heroResp.text().catch(() => '');
    throw new Error(`image-gen hero failed: ${heroResp.status} ${detail}`);
  }
  const { r2Key: heroR2Key } = await heroResp.json() as { r2Key: string };

  // 5. Generate copy via Llama.
  const llamaResult = await env.AI.run(MODEL, {
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: userPrompt({
          title: doc.title,
          cuisine: doc.cuisine,
          totalTimeFormatted,
          topIngredients,
        }),
      },
    ],
    max_tokens: 600,
    temperature: 0.7,
  }) as Record<string, unknown>;

  // Spike A finding: Workers AI may return either a JSON-encoded string or a
  // pre-parsed object in `result.response`. Handle both shapes; let any
  // parse error throw and bubble to msg.retry().
  const payload = typeof llamaResult.response === 'string'
    ? JSON.parse(llamaResult.response)
    : llamaResult.response;
  const copy = validate(payload);

  // 6. Compose pin PNG.
  const pinPng = await composePin({
    heroR2Key,
    pinTitle: copy.pin_title,
    totalTime: totalTimeFormatted,
  });
  const pinR2Key = `drafts/${draftId}/pin.png`;
  await env.RR_SOCIAL_ASSETS.put(pinR2Key, pinPng, {
    httpMetadata: {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    },
  });

  // 7. Insert draft.
  const platform: Platform = 'pinterest';
  const ctaUrl =
    `https://r.reduced.recipes/${draftId}` +
    `?utm_source=pinterest` +
    `&utm_medium=organic_social` +
    `&utm_campaign=${candidate.theme ?? 'default'}` +
    `&utm_content=${draftId}`;

  await env.DB.prepare(`
    INSERT INTO social_drafts
      (id, source_id, platform, variant_label, caption, hashtags, hook, script, cta_text, cta_url,
       asset_r2_keys, prompt_version, model, generation_cost_usd, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL, 'pending_approval', ?)
  `).bind(
    draftId,
    candidate.candidate_id,
    platform,
    PROMPT_VERSION,
    copy.pin_description,
    JSON.stringify(copy.hashtags),
    'Get the full recipe at reduced.recipes, no story scroll.',
    ctaUrl,
    JSON.stringify([heroR2Key, pinR2Key]),
    PROMPT_VERSION,
    MODEL,
    Date.now(),
  ).run();

  console.log(`SOCIAL_ADAPTER_PINTEREST: draft ${draftId} created for candidate ${candidate.candidate_id}`);
}

export default {
  async queue(batch: MessageBatch<JobBody>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        await processJob(env, msg.body);
        msg.ack();
      } catch (err) {
        console.error(
          `SOCIAL_ADAPTER_PINTEREST: job ${msg.body.candidateId} failed:`,
          err,
        );
        msg.retry();
      }
    }
  },
};
