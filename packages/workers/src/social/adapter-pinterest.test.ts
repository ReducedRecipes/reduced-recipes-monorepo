import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mock @rr/social-shared so we control ulid + use real formatTotalTime ──
vi.mock('@rr/social-shared', () => ({
  ulid: () => 'TEST_DRAFT_01',
  formatTotalTime: (minutes: number | null) => {
    if (!minutes || minutes <= 0) return '';
    if (minutes < 60) return `${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
  },
}));

// ── Mock the compose module so tests don't depend on Satori/font wiring ──
const composePinMock = vi.fn(
  async (_input: { heroR2Key: string; pinTitle: string; totalTime: string }) =>
    new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
);
vi.mock('./adapter-pinterest.compose', () => ({
  composePin: (input: { heroR2Key: string; pinTitle: string; totalTime: string }) =>
    composePinMock(input),
}));

import adapter from './adapter-pinterest';
import { PROMPT_VERSION, MODEL, SYSTEM_PROMPT } from './adapter-pinterest.prompts';

// ── Test doubles ─────────────────────────────────────────────────────────

interface CapturedBind {
  sql: string;
  bindings: unknown[];
}

interface CapturedPut {
  key: string;
  body: unknown;
  opts: R2PutOptions | undefined;
}

interface DbState {
  candidate: { candidate_id: string; recipe_id: string; theme: string | null } | null;
}

function makeDb(state: DbState) {
  const allBindCalls: CapturedBind[] = [];
  const runResults: unknown[] = [];

  const prepare = vi.fn((sql: string) => {
    const handle = {
      bind: vi.fn((...bindings: unknown[]) => {
        allBindCalls.push({ sql, bindings });
        return handle;
      }),
      first: vi.fn(async <T,>() => {
        if (sql.includes('FROM social_source_candidates')) {
          return state.candidate as T | null;
        }
        return null;
      }),
      run: vi.fn(async () => {
        const result = { success: true } as unknown as D1Result;
        runResults.push(result);
        return result;
      }),
    };
    return handle;
  });

  return {
    db: { prepare } as unknown as D1Database,
    allBindCalls,
    runResults,
  };
}

function makeKv(docByKey: Record<string, string | null>) {
  const get = vi.fn(async (key: string, _type?: 'text') => docByKey[key] ?? null);
  return { kv: { get } as unknown as KVNamespace, get };
}

function makeBucket() {
  const calls: CapturedPut[] = [];
  const put = vi.fn(async (key: string, body: unknown, opts?: R2PutOptions) => {
    calls.push({ key, body, opts });
    return {} as R2Object;
  });
  return { bucket: { put } as unknown as R2Bucket, calls, put };
}

function makeImageGen(handler: (req: Request) => Response | Promise<Response>) {
  const fetchMock = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const req = new Request(input as string, init);
    return handler(req);
  });
  return { fetcher: { fetch: fetchMock } as unknown as Fetcher, fetch: fetchMock };
}

function makeAi(returnValue: unknown) {
  const run = vi.fn(async (_model: string, _opts: unknown) => returnValue);
  return { ai: { run } as unknown as Ai, run };
}

function makeMessage(candidateId: string) {
  const ack = vi.fn();
  const retry = vi.fn();
  return {
    msg: {
      id: `msg-${candidateId}`,
      timestamp: new Date(),
      body: { candidateId },
      attempts: 1,
      ack,
      retry,
    } as unknown as Message<{ candidateId: string }>,
    ack,
    retry,
  };
}

function makeBatch(candidateIds: string[]) {
  const wrappers = candidateIds.map((id) => makeMessage(id));
  const batch = {
    queue: 'rr-social-pinterest-jobs',
    messages: wrappers.map((w) => w.msg),
  } as unknown as MessageBatch<{ candidateId: string }>;
  return { batch, wrappers };
}

const VALID_LLAMA_PAYLOAD = {
  pin_title: 'Spaghetti Carbonara, 4 Ingredients, 20 Minutes',
  pin_description:
    'Four ingredients, one pan, no cream. The Roman version of carbonara built on egg, pecorino, guanciale and black pepper, finished off the heat so the eggs stay silky instead of scrambled. Ready in the time it takes to boil pasta. Get the full recipe at reduced.recipes, no story scroll.',
  hashtags: ['#weeknightdinner', '#onepanmeal', '#carbonara', '#italianfood', '#pastarecipes'],
};

const SAMPLE_DOC = {
  id: 'rec_carbonara',
  title: 'Spaghetti Carbonara',
  cuisine: 'Italian',
  total_time: 20,
  yields: '2 servings',
  ingredients: [
    '200 g spaghetti',
    '100 g guanciale, diced',
    '2 large eggs + 2 yolks',
    '60 g pecorino romano, grated',
    'freshly cracked black pepper',
    '(extra fluff that should be sliced off)',
  ],
  instructions: ['Boil pasta', 'Render guanciale', 'Toss off heat'],
  image_url: null,
  source_url: 'https://example.com/carbonara',
  domain: 'example.com',
};

beforeEach(() => {
  composePinMock.mockClear();
  composePinMock.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Happy path ───────────────────────────────────────────────────────────

describe('adapter-pinterest queue consumer — happy path', () => {
  it('inserts exactly one social_drafts row with correct bind values', async () => {
    const candidate = { candidate_id: 'cand_01', recipe_id: 'rec_carbonara', theme: 'comfort_food' };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets, calls: assetCalls } = makeBucket();
    const { fetcher: imageGen, fetch: imageGenFetch } = makeImageGen(
      async () => new Response(JSON.stringify({ r2Key: 'drafts/TEST_DRAFT_01/hero.jpg', bytes: 12345 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const { ai, run: aiRun } = makeAi({ response: VALID_LLAMA_PAYLOAD });

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_01']);

    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    // ack on success, no retry.
    expect(wrappers[0]!.ack).toHaveBeenCalledTimes(1);
    expect(wrappers[0]!.retry).not.toHaveBeenCalled();

    // Image-gen called with hero slot + propagated cuisine/title + draftId.
    expect(imageGenFetch).toHaveBeenCalledTimes(1);
    const [imageGenUrl, imageGenInit] = imageGenFetch.mock.calls[0]!;
    expect(imageGenUrl).toBe('https://internal/generate-recipe-shot');
    const heroBody = JSON.parse((imageGenInit as RequestInit).body as string) as {
      slot: string; recipe: { title: string; cuisine: string | null }; draftId: string;
    };
    expect(heroBody.slot).toBe('hero');
    expect(heroBody.recipe).toEqual({ title: 'Spaghetti Carbonara', cuisine: 'Italian' });
    expect(heroBody.draftId).toBe('TEST_DRAFT_01');

    // AI invoked with the spec'd model + system prompt + user prompt that
    // includes top 5 ingredients (NOT 6).
    expect(aiRun).toHaveBeenCalledTimes(1);
    const [aiModel, aiOpts] = aiRun.mock.calls[0]!;
    expect(aiModel).toBe(MODEL);
    const opts = aiOpts as { messages: Array<{ role: string; content: string }> };
    expect(opts.messages[0]!.role).toBe('system');
    expect(opts.messages[0]!.content).toBe(SYSTEM_PROMPT);
    expect(opts.messages[1]!.role).toBe('user');
    const userContent = opts.messages[1]!.content;
    expect(userContent).toContain('Spaghetti Carbonara');
    expect(userContent).toContain('Italian');
    expect(userContent).toContain('20 min');
    expect(userContent).toContain('200 g spaghetti');
    expect(userContent).toContain('freshly cracked black pepper');
    // 6th ingredient should NOT be present (top 5 only).
    expect(userContent).not.toContain('extra fluff');

    // composePin called with the propagated hero key, pin title, totalTime.
    expect(composePinMock).toHaveBeenCalledTimes(1);
    expect(composePinMock).toHaveBeenCalledWith({
      heroR2Key: 'drafts/TEST_DRAFT_01/hero.jpg',
      pinTitle: VALID_LLAMA_PAYLOAD.pin_title,
      totalTime: '20 min',
    });

    // Pin PNG uploaded to the spec'd path with cache headers.
    const pinPut = assetCalls.find((c) => c.key === 'drafts/TEST_DRAFT_01/pin.png');
    expect(pinPut).toBeDefined();
    expect(pinPut!.opts?.httpMetadata).toEqual({
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });

    // Single INSERT into social_drafts.
    const inserts = allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'));
    expect(inserts).toHaveLength(1);
    const bindings = inserts[0]!.bindings;
    // Order matches the prepared statement's `?` placeholders:
    // (id, source_id, platform, variant_label, caption, hashtags,
    //  cta_text, cta_url, asset_r2_keys, prompt_version, model, created_at)
    expect(bindings[0]).toBe('TEST_DRAFT_01');                                 // id
    expect(bindings[1]).toBe('cand_01');                                       // source_id = candidate.candidate_id
    expect(bindings[2]).toBe('pinterest');                                     // platform
    expect(bindings[3]).toBe(PROMPT_VERSION);                                  // variant_label
    expect(bindings[4]).toBe(VALID_LLAMA_PAYLOAD.pin_description);             // caption
    expect(bindings[5]).toBe(JSON.stringify(VALID_LLAMA_PAYLOAD.hashtags));    // hashtags JSON array
    expect(bindings[6]).toBe('Get the full recipe at reduced.recipes, no story scroll.'); // cta_text
    const ctaUrl = bindings[7] as string;
    expect(ctaUrl).toContain('https://r.reduced.recipes/TEST_DRAFT_01?');
    expect(ctaUrl).toContain('utm_source=pinterest');
    expect(ctaUrl).toContain('utm_medium=organic_social');
    expect(ctaUrl).toContain('utm_campaign=comfort_food');
    expect(ctaUrl).toContain('utm_content=TEST_DRAFT_01');
    expect(bindings[8]).toBe(JSON.stringify(['drafts/TEST_DRAFT_01/hero.jpg', 'drafts/TEST_DRAFT_01/pin.png'])); // asset_r2_keys
    expect(bindings[9]).toBe(PROMPT_VERSION);                                  // prompt_version
    expect(bindings[10]).toBe(MODEL);                                          // model
    expect(typeof bindings[11]).toBe('number');                                // created_at

    // Status literal lives in the SQL, not bindings — verify it.
    expect(inserts[0]!.sql).toContain("'pending_approval'");
  });

  it('falls back to utm_campaign=default when candidate.theme is null', async () => {
    const candidate = { candidate_id: 'cand_02', recipe_id: 'rec_carbonara', theme: null };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets } = makeBucket();
    const { fetcher: imageGen } = makeImageGen(
      async () => new Response(JSON.stringify({ r2Key: 'drafts/TEST_DRAFT_01/hero.jpg', bytes: 1 })),
    );
    const { ai } = makeAi({ response: VALID_LLAMA_PAYLOAD });

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_02']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.ack).toHaveBeenCalledTimes(1);
    const inserts = allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'));
    const ctaUrl = inserts[0]!.bindings[7] as string;
    expect(ctaUrl).toContain('utm_campaign=default');
  });

  it('parses Llama response when it arrives as a JSON-encoded string', async () => {
    const candidate = { candidate_id: 'cand_str', recipe_id: 'rec_carbonara', theme: null };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets } = makeBucket();
    const { fetcher: imageGen } = makeImageGen(
      async () => new Response(JSON.stringify({ r2Key: 'drafts/TEST_DRAFT_01/hero.jpg' })),
    );
    const { ai } = makeAi({ response: JSON.stringify(VALID_LLAMA_PAYLOAD) });

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_str']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.ack).toHaveBeenCalledTimes(1);
    const inserts = allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.bindings[4]).toBe(VALID_LLAMA_PAYLOAD.pin_description);
  });
});

// ── Failure paths ────────────────────────────────────────────────────────

describe('adapter-pinterest queue consumer — failures retry to DLQ', () => {
  it('retries when candidate row is not found (no draft inserted)', async () => {
    const { db, allBindCalls } = makeDb({ candidate: null });
    const { kv } = makeKv({});
    const { bucket: assets, calls: assetCalls } = makeBucket();
    const { fetcher: imageGen, fetch: imageGenFetch } = makeImageGen(
      async () => new Response('should not be called', { status: 500 }),
    );
    const { ai, run: aiRun } = makeAi(null);

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_missing']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.retry).toHaveBeenCalledTimes(1);
    expect(wrappers[0]!.ack).not.toHaveBeenCalled();
    expect(imageGenFetch).not.toHaveBeenCalled();
    expect(aiRun).not.toHaveBeenCalled();
    expect(assetCalls).toHaveLength(0);
    expect(allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'))).toHaveLength(0);
  });

  it('retries when RecipeDocument is missing from KV', async () => {
    const candidate = { candidate_id: 'cand_x', recipe_id: 'rec_unknown', theme: null };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({}); // no recipe doc
    const { bucket: assets } = makeBucket();
    const { fetcher: imageGen, fetch: imageGenFetch } = makeImageGen(
      async () => new Response('{}', { status: 200 }),
    );
    const { ai } = makeAi(null);

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_x']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.retry).toHaveBeenCalledTimes(1);
    expect(imageGenFetch).not.toHaveBeenCalled();
    expect(allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'))).toHaveLength(0);
  });

  it('retries when image-gen returns non-2xx (no draft inserted)', async () => {
    const candidate = { candidate_id: 'cand_imgfail', recipe_id: 'rec_carbonara', theme: null };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets, calls: assetCalls } = makeBucket();
    const { fetcher: imageGen } = makeImageGen(
      async () => new Response('upstream blew up', { status: 502 }),
    );
    const { ai, run: aiRun } = makeAi(null);

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_imgfail']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.retry).toHaveBeenCalledTimes(1);
    expect(aiRun).not.toHaveBeenCalled();
    expect(assetCalls).toHaveLength(0);
    expect(allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'))).toHaveLength(0);
  });

  it('retries when Llama returns malformed JSON string (parse failure)', async () => {
    const candidate = { candidate_id: 'cand_badjson', recipe_id: 'rec_carbonara', theme: null };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets, calls: assetCalls } = makeBucket();
    const { fetcher: imageGen } = makeImageGen(
      async () => new Response(JSON.stringify({ r2Key: 'drafts/TEST_DRAFT_01/hero.jpg' })),
    );
    const { ai } = makeAi({ response: 'not json at all' });

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_badjson']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.retry).toHaveBeenCalledTimes(1);
    expect(assetCalls).toHaveLength(0);
    expect(allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'))).toHaveLength(0);
  });

  it('retries when Llama JSON is shape-invalid (validate throws)', async () => {
    const candidate = { candidate_id: 'cand_invalid', recipe_id: 'rec_carbonara', theme: null };
    const { db, allBindCalls } = makeDb({ candidate });
    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets, calls: assetCalls } = makeBucket();
    const { fetcher: imageGen } = makeImageGen(
      async () => new Response(JSON.stringify({ r2Key: 'drafts/TEST_DRAFT_01/hero.jpg' })),
    );
    // Missing pin_description — schema mismatch, validate() throws.
    const { ai } = makeAi({ response: { pin_title: 'short', hashtags: ['#a', '#b', '#c', '#d'] } });

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_invalid']);
    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.retry).toHaveBeenCalledTimes(1);
    expect(assetCalls).toHaveLength(0);
    expect(allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'))).toHaveLength(0);
  });

  it('handles a mixed batch — successful messages ack, failing ones retry', async () => {
    const goodCandidate = { candidate_id: 'cand_ok', recipe_id: 'rec_carbonara', theme: null };
    const allBindCalls: CapturedBind[] = [];

    // Build a single DB whose first() returns the good candidate for cand_ok
    // and null for cand_bad.
    const prepare = vi.fn((sql: string) => {
      const handle = {
        bindings: [] as unknown[],
        bind: vi.fn(function (this: typeof handle, ...bindings: unknown[]) {
          this.bindings = bindings;
          allBindCalls.push({ sql, bindings });
          return handle;
        }),
        first: vi.fn(async function (this: typeof handle) {
          if (sql.includes('FROM social_source_candidates')) {
            const cid = this.bindings[0];
            return cid === 'cand_ok' ? goodCandidate : null;
          }
          return null;
        }),
        run: vi.fn(async () => ({ success: true } as unknown as D1Result)),
      };
      return handle;
    });
    const db = { prepare } as unknown as D1Database;

    const { kv } = makeKv({ 'recipe:rec_carbonara': JSON.stringify(SAMPLE_DOC) });
    const { bucket: assets } = makeBucket();
    const { fetcher: imageGen } = makeImageGen(
      async () => new Response(JSON.stringify({ r2Key: 'drafts/TEST_DRAFT_01/hero.jpg' })),
    );
    const { ai } = makeAi({ response: VALID_LLAMA_PAYLOAD });

    const env = { AI: ai, DB: db, RECIPES_KV: kv, RR_SOCIAL_ASSETS: assets, IMAGE_GEN: imageGen };
    const { batch, wrappers } = makeBatch(['cand_ok', 'cand_bad']);

    await adapter.queue(batch, env as unknown as Parameters<typeof adapter.queue>[1]);

    expect(wrappers[0]!.ack).toHaveBeenCalledTimes(1);
    expect(wrappers[0]!.retry).not.toHaveBeenCalled();
    expect(wrappers[1]!.retry).toHaveBeenCalledTimes(1);
    expect(wrappers[1]!.ack).not.toHaveBeenCalled();

    // Exactly one INSERT for the successful message.
    expect(allBindCalls.filter((c) => c.sql.includes('INSERT INTO social_drafts'))).toHaveLength(1);
  });
});

// ── Prompt content guard — voice canon must be embedded ──────────────────

describe('adapter-pinterest prompts — voice canon embedded', () => {
  it('SYSTEM_PROMPT contains the trope wall verbatim from spec §14.4', () => {
    expect(SYSTEM_PROMPT).toContain('Today I want to share');
    expect(SYSTEM_PROMPT).toContain('My family LOVES this');
    expect(SYSTEM_PROMPT).toContain('The BEST');
    expect(SYSTEM_PROMPT).toContain('You NEED to try this');
    expect(SYSTEM_PROMPT).toContain('Literally the easiest');
    expect(SYSTEM_PROMPT).toContain('Game changer');
    expect(SYSTEM_PROMPT).toContain('Easy peasy');
    expect(SYSTEM_PROMPT).toContain('Healthy and delicious');
  });

  it('SYSTEM_PROMPT pins the literal CTA wording', () => {
    expect(SYSTEM_PROMPT).toContain('Get the full recipe at reduced.recipes, no story scroll.');
  });

  it('SYSTEM_PROMPT enumerates the calibration dials', () => {
    expect(SYSTEM_PROMPT).toContain('Specific over universal');
    expect(SYSTEM_PROMPT).toContain('Quiet over enthusiastic');
    expect(SYSTEM_PROMPT).toContain('Earned over promised');
  });

  it('SYSTEM_PROMPT locks the §14.6 constraint list', () => {
    expect(SYSTEM_PROMPT).toContain('Never claim health benefits');
    expect(SYSTEM_PROMPT).toContain('Never say "AI-generated"');
    expect(SYSTEM_PROMPT).toContain('Do NOT credit source sites');
  });

  it('PROMPT_VERSION and MODEL are the ticket-008 constants', () => {
    expect(PROMPT_VERSION).toBe('pinterest_v1.0');
    expect(MODEL).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  });
});
