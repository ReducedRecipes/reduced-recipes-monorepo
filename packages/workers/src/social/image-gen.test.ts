import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @rr/social-shared so we control the cache helpers ───────────────
// We keep `normaliseIngredientKey` mostly true to its real behaviour (it's
// imported by the worker for the empty-string short-circuit) — a tiny lower-
// case + trim is enough for these tests.
const lookupIngredientImage = vi.fn();
const recordIngredientImage = vi.fn();

vi.mock('@rr/social-shared', () => ({
  normaliseIngredientKey: (raw: string) => raw.toLowerCase().trim(),
  lookupIngredientImage: (...args: unknown[]) => lookupIngredientImage(...args),
  recordIngredientImage: (...args: unknown[]) => recordIngredientImage(...args),
}));

import imageGen from './image-gen';
import {
  heroPrompt, finishedPrompt, ingredientPrompt, stepPrompt, PROMPT_VERSION, MODEL,
} from './image-gen.prompts';

// ── Fake JPEG bytes (header only — enough to verify byteLength + put body) ─
// JPEG/JFIF signature: FF D8 FF E0 ... 4A 46 49 46
const FAKE_JPG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const FAKE_JPG_B64 = btoa(String.fromCharCode(...FAKE_JPG_BYTES));

// ── Test doubles ─────────────────────────────────────────────────────────

interface PutCall { key: string; body: ArrayBuffer; opts: R2PutOptions | undefined }

function makeBucket() {
  const calls: PutCall[] = [];
  const put = vi.fn(async (key: string, body: ArrayBuffer, opts?: R2PutOptions) => {
    calls.push({ key, body, opts });
    return {} as R2Object;
  });
  return { bucket: { put } as unknown as R2Bucket, calls };
}

function makeDb() {
  // Image-gen never directly calls env.DB.prepare in the worker — the cache
  // helpers do, and they're mocked at the module boundary above. Provide a
  // throwing prepare so any accidental direct usage is loud.
  return {
    prepare: vi.fn(() => { throw new Error('image-gen worker should not call DB.prepare directly'); }),
  } as unknown as D1Database;
}

interface AiRunArgs { prompt: string; steps?: number }
function makeAi(returnValue: unknown) {
  const run = vi.fn(async (_model: string, _opts: AiRunArgs) => returnValue);
  return { ai: { run } as unknown as Ai, run };
}

function makeEnv(opts: { aiReturn?: unknown } = {}) {
  const cache = makeBucket();
  const assets = makeBucket();
  const ai = makeAi(opts.aiReturn ?? { image: FAKE_JPG_B64 });
  const env = {
    AI: ai.ai,
    DB: makeDb(),
    RR_SOCIAL_CACHE: cache.bucket,
    RR_SOCIAL_ASSETS: assets.bucket,
  };
  return { env, cache, assets, ai };
}

beforeEach(() => {
  lookupIngredientImage.mockReset();
  recordIngredientImage.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ── Routing ──────────────────────────────────────────────────────────────

describe('image-gen worker — routing', () => {
  it('returns 404 on GET /generate-ingredient', async () => {
    const { env } = makeEnv();
    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', { method: 'GET' }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );
    expect(res.status).toBe(404);
  });

  it('returns 404 for unknown POST paths', async () => {
    const { env } = makeEnv();
    const res = await imageGen.fetch(
      new Request('http://localhost/whatever', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );
    expect(res.status).toBe(404);
  });
});

// ── /generate-ingredient ─────────────────────────────────────────────────

describe('POST /generate-ingredient', () => {
  it('returns cached row without calling AI when cache hit', async () => {
    const { env, ai, cache } = makeEnv();
    lookupIngredientImage.mockResolvedValueOnce({
      ingredient_key: 'garlic',
      r2_key: 'ingredients/v1.0/garlic.jpg',
      prompt_version: 'v1.0',
      model: MODEL,
      generated_at: 1234567890,
      bytes: 4242,
    });

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: 'garlic' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { r2Key: string; cached: boolean; bytes: number };
    expect(json).toEqual({ r2Key: 'ingredients/v1.0/garlic.jpg', cached: true, bytes: 4242 });

    // Cache-hit means: no AI call, no R2 put, no record.
    expect(ai.run).not.toHaveBeenCalled();
    expect(cache.calls).toHaveLength(0);
    expect(recordIngredientImage).not.toHaveBeenCalled();
  });

  it('on cache miss, generates via AI, uploads to RR_SOCIAL_CACHE, and records', async () => {
    const { env, ai, cache } = makeEnv();
    lookupIngredientImage.mockResolvedValueOnce(null);
    recordIngredientImage.mockResolvedValueOnce(undefined);

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: 'garlic' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { r2Key: string; cached: boolean; bytes: number };
    expect(json.cached).toBe(false);
    expect(json.r2Key).toBe('ingredients/v1.0/garlic.jpg');
    expect(json.bytes).toBe(FAKE_JPG_BYTES.byteLength);

    // AI invoked with the ingredient prompt.
    expect(ai.run).toHaveBeenCalledTimes(1);
    expect(ai.run).toHaveBeenCalledWith(MODEL, expect.objectContaining({
      prompt: ingredientPrompt('garlic'),
      steps: 4,
    }));

    // R2 put with correct key + cache headers.
    expect(cache.calls).toHaveLength(1);
    const [putCall] = cache.calls;
    expect(putCall!.key).toBe('ingredients/v1.0/garlic.jpg');
    expect((putCall!.body as ArrayBuffer).byteLength).toBe(FAKE_JPG_BYTES.byteLength);
    expect(putCall!.opts?.httpMetadata).toEqual({
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    // D1 cache row recorded.
    expect(recordIngredientImage).toHaveBeenCalledTimes(1);
    expect(recordIngredientImage).toHaveBeenCalledWith(env, expect.objectContaining({
      ingredient: 'garlic',
      r2Key: 'ingredients/v1.0/garlic.jpg',
      bytes: FAKE_JPG_BYTES.byteLength,
      promptVersion: PROMPT_VERSION,
      model: MODEL,
    }));
  });

  it('returns 400 when ingredient normalises to empty', async () => {
    const { env, ai } = makeEnv();
    // The mocked normaliseIngredientKey returns the raw lowercase trim, so
    // empty input maps to empty string.
    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: '   ' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );
    expect(res.status).toBe(400);
    expect(ai.run).not.toHaveBeenCalled();
    expect(lookupIngredientImage).not.toHaveBeenCalled();
  });

  it('slugifies multi-word ingredient keys for R2 path', async () => {
    const { env, cache } = makeEnv();
    lookupIngredientImage.mockResolvedValueOnce(null);
    recordIngredientImage.mockResolvedValueOnce(undefined);

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: 'olive oil' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    expect(res.status).toBe(200);
    expect(cache.calls[0]!.key).toBe('ingredients/v1.0/olive-oil.jpg');
  });
});

// ── /generate-recipe-shot ────────────────────────────────────────────────

describe('POST /generate-recipe-shot', () => {
  it('uploads hero shot to RR_SOCIAL_ASSETS at drafts/{draftId}/hero.jpg', async () => {
    const { env, ai, assets, cache } = makeEnv();

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-recipe-shot', {
        method: 'POST',
        body: JSON.stringify({
          slot: 'hero',
          recipe: { title: 'Modern Pasta Salad', cuisine: null },
          draftId: 'DRAFT123',
        }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { r2Key: string; bytes: number };
    expect(json.r2Key).toBe('drafts/DRAFT123/hero.jpg');
    expect(json.bytes).toBe(FAKE_JPG_BYTES.byteLength);

    expect(ai.run).toHaveBeenCalledTimes(1);
    // Modern Pasta Salad does NOT match any cuisine-negation entry, so the
    // prompt should be the bare hero base.
    const callArgs = ai.run.mock.calls[0]!;
    expect(callArgs[0]).toBe(MODEL);
    const prompt = callArgs[1].prompt as string;
    expect(prompt).toBe(heroPrompt({ title: 'Modern Pasta Salad', cuisine: null }));
    expect(prompt).not.toContain('no tomato sauce');

    // Asset bucket got the put with cache headers; the cache bucket was
    // untouched (recipe shots are always-fresh, not cached).
    expect(assets.calls).toHaveLength(1);
    expect(cache.calls).toHaveLength(0);
    expect(assets.calls[0]!.opts?.httpMetadata).toEqual({
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('uploads finished shot to drafts/{draftId}/finished.jpg with FINISHED prompt', async () => {
    const { env, ai, assets } = makeEnv();

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-recipe-shot', {
        method: 'POST',
        body: JSON.stringify({
          slot: 'finished',
          recipe: { title: 'Modern Pasta Salad', cuisine: null },
          draftId: 'DRAFT999',
        }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { r2Key: string };
    expect(json.r2Key).toBe('drafts/DRAFT999/finished.jpg');
    expect(assets.calls[0]!.key).toBe('drafts/DRAFT999/finished.jpg');

    const prompt = ai.run.mock.calls[0]![1].prompt as string;
    expect(prompt).toBe(finishedPrompt({ title: 'Modern Pasta Salad', cuisine: null }));
    expect(prompt).toContain('three-quarter angle');
  });

  it('applies the cuisine-negation suffix for italian carbonara', async () => {
    const { env, ai } = makeEnv();

    await imageGen.fetch(
      new Request('http://localhost/generate-recipe-shot', {
        method: 'POST',
        body: JSON.stringify({
          slot: 'hero',
          recipe: { title: 'Carbonara with Guanciale', cuisine: 'Italian' },
          draftId: 'DRAFT_CARB',
        }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    const prompt = ai.run.mock.calls[0]![1].prompt as string;
    // Negation suffix from CUISINE_NEGATIONS['italian carbonara'] should be
    // appended.
    expect(prompt).toContain('no tomato sauce');
    expect(prompt).toContain('only egg and cheese coating the pasta');
  });

  it('does NOT apply carbonara negation to a non-matching pasta title', async () => {
    const { env, ai } = makeEnv();

    await imageGen.fetch(
      new Request('http://localhost/generate-recipe-shot', {
        method: 'POST',
        body: JSON.stringify({
          slot: 'hero',
          recipe: { title: 'Modern Pasta Salad', cuisine: 'Italian' },
          draftId: 'DRAFT_PS',
        }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    const prompt = ai.run.mock.calls[0]![1].prompt as string;
    expect(prompt).not.toContain('no tomato sauce');
  });
});

// ── /generate-step-shot ──────────────────────────────────────────────────

describe('POST /generate-step-shot', () => {
  it('uploads step shot to drafts/{draftId}/step-{index}.jpg', async () => {
    const { env, ai, assets } = makeEnv();

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-step-shot', {
        method: 'POST',
        body: JSON.stringify({
          slot: 'step',
          action: 'whisking eggs in a bowl',
          draftId: 'DRAFT_STEP',
          index: 3,
        }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );

    expect(res.status).toBe(200);
    const json = await res.json() as { r2Key: string; bytes: number };
    expect(json.r2Key).toBe('drafts/DRAFT_STEP/step-3.jpg');
    expect(json.bytes).toBe(FAKE_JPG_BYTES.byteLength);

    expect(assets.calls).toHaveLength(1);
    expect(assets.calls[0]!.key).toBe('drafts/DRAFT_STEP/step-3.jpg');
    expect(assets.calls[0]!.opts?.httpMetadata).toEqual({
      contentType: 'image/jpeg',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    const prompt = ai.run.mock.calls[0]![1].prompt as string;
    expect(prompt).toBe(stepPrompt('whisking eggs in a bowl'));
  });
});

// ── flux() response-shape handling ───────────────────────────────────────

describe('flux response-shape handling', () => {
  it('handles ArrayBuffer return shape', async () => {
    const ab = FAKE_JPG_BYTES.buffer.slice(0);
    const { env, cache } = makeEnv({ aiReturn: ab });
    lookupIngredientImage.mockResolvedValueOnce(null);
    recordIngredientImage.mockResolvedValueOnce(undefined);

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: 'garlic' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );
    expect(res.status).toBe(200);
    expect((cache.calls[0]!.body as ArrayBuffer).byteLength).toBe(FAKE_JPG_BYTES.byteLength);
  });

  it('handles Uint8Array return shape', async () => {
    const { env, cache } = makeEnv({ aiReturn: FAKE_JPG_BYTES });
    lookupIngredientImage.mockResolvedValueOnce(null);
    recordIngredientImage.mockResolvedValueOnce(undefined);

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: 'garlic' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );
    expect(res.status).toBe(200);
    expect((cache.calls[0]!.body as ArrayBuffer).byteLength).toBe(FAKE_JPG_BYTES.byteLength);
  });

  it('handles ReadableStream return shape', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(FAKE_JPG_BYTES);
        controller.close();
      },
    });
    const { env, cache } = makeEnv({ aiReturn: stream });
    lookupIngredientImage.mockResolvedValueOnce(null);
    recordIngredientImage.mockResolvedValueOnce(undefined);

    const res = await imageGen.fetch(
      new Request('http://localhost/generate-ingredient', {
        method: 'POST',
        body: JSON.stringify({ ingredient: 'garlic' }),
      }),
      env as unknown as Parameters<typeof imageGen.fetch>[1],
    );
    expect(res.status).toBe(200);
    expect((cache.calls[0]!.body as ArrayBuffer).byteLength).toBe(FAKE_JPG_BYTES.byteLength);
  });
});
