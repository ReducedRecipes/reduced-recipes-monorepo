import {
  recordIngredientImage, lookupIngredientImage, normaliseIngredientKey,
} from '@rr/social-shared';
import {
  heroPrompt, finishedPrompt, ingredientPrompt, stepPrompt, PROMPT_VERSION, MODEL,
} from './image-gen.prompts';

interface Env {
  AI: Ai;
  DB: D1Database;
  RR_SOCIAL_CACHE: R2Bucket;
  RR_SOCIAL_ASSETS: R2Bucket;
}

interface IngredientReq { ingredient: string }
interface RecipeShotReq {
  slot: 'hero' | 'finished';
  recipe: { title: string; cuisine: string | null };
  draftId: string;
}
interface StepShotReq {
  slot: 'step';
  action: string;
  draftId: string;
  index: number;
}

async function generateIngredient(env: Env, req: IngredientReq): Promise<Response> {
  const key = normaliseIngredientKey(req.ingredient);
  if (!key) return Response.json({ error: 'ingredient normalised to empty' }, { status: 400 });

  const existing = await lookupIngredientImage(env, req.ingredient);
  if (existing) return Response.json({ r2Key: existing.r2_key, cached: true, bytes: existing.bytes });

  const png = await flux(env, ingredientPrompt(key));
  const r2Key = `ingredients/${PROMPT_VERSION}/${slug(key)}.png`;
  await env.RR_SOCIAL_CACHE.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  await recordIngredientImage(env, {
    ingredient: req.ingredient,
    r2Key, bytes: png.byteLength,
    promptVersion: PROMPT_VERSION, model: MODEL,
  });
  return Response.json({ r2Key, cached: false, bytes: png.byteLength });
}

async function generateRecipeShot(env: Env, req: RecipeShotReq): Promise<Response> {
  const prompt = req.slot === 'hero' ? heroPrompt(req.recipe) : finishedPrompt(req.recipe);
  const png = await flux(env, prompt);
  const r2Key = `drafts/${req.draftId}/${req.slot}.png`;
  await env.RR_SOCIAL_ASSETS.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  return Response.json({ r2Key, bytes: png.byteLength });
}

async function generateStepShot(env: Env, req: StepShotReq): Promise<Response> {
  const png = await flux(env, stepPrompt(req.action));
  const r2Key = `drafts/${req.draftId}/step-${req.index}.png`;
  await env.RR_SOCIAL_ASSETS.put(r2Key, png, {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
  });
  return Response.json({ r2Key, bytes: png.byteLength });
}

// Workers AI Flux response shape varies between revisions; spike A/B observed
// ArrayBuffer, Uint8Array, ReadableStream, and { image: base64 } shapes. Handle
// all defensively rather than relying on a single shape.
async function flux(env: Env, prompt: string): Promise<ArrayBuffer> {
  const out = await env.AI.run(MODEL, { prompt, steps: 4 }) as
    | ReadableStream | ArrayBuffer | Uint8Array | { image: string };

  if (out instanceof ArrayBuffer) return out;
  if (out instanceof Uint8Array) {
    // Copy into a fresh ArrayBuffer so the return type is concrete
    // (Uint8Array.buffer can be SharedArrayBuffer in some lib targets).
    const copy = new Uint8Array(out.byteLength);
    copy.set(out);
    return copy.buffer;
  }
  if (out instanceof ReadableStream) return await new Response(out).arrayBuffer();
  if (typeof (out as { image?: string }).image === 'string') {
    const b64 = (out as { image: string }).image;
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  }
  throw new Error('Unknown Flux response shape');
}

function slug(s: string): string {
  return s.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== 'POST') return new Response('Not found', { status: 404 });

    if (url.pathname === '/generate-ingredient') {
      return generateIngredient(env, await req.json() as IngredientReq);
    }
    if (url.pathname === '/generate-recipe-shot') {
      return generateRecipeShot(env, await req.json() as RecipeShotReq);
    }
    if (url.pathname === '/generate-step-shot') {
      return generateStepShot(env, await req.json() as StepShotReq);
    }
    return new Response('Not found', { status: 404 });
  },
};
