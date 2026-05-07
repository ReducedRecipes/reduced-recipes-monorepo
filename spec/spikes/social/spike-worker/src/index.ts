import { SAMPLE_RECIPES, type SampleRecipe } from './recipes';

interface Env {
  AI: Ai;
}

const PINTEREST_PROMPT_SYSTEM = `You are writing a Pinterest pin for ReducedRecipes, a recipe site that strips blog narratives and surfaces clean, structured recipes.

Write three things:
1. PIN_TITLE: <=100 chars, search-optimised. Lead with the dish, then a benefit (fast / one-pan / 5-ingredient / make-ahead). No emoji in title.
2. PIN_DESCRIPTION: 200-400 chars. Conversational, second-person. Include 2-3 SEO keywords naturally. End with a soft CTA: "Get the full recipe — no scrolling through stories."
3. HASHTAGS: 4-6 specific hashtags as a JSON array of strings. Mix broad + niche. No #recipe (too broad). Prefer specifics like #weeknightdinner, #onepanmeal.

Return STRICT JSON with exactly these keys: pin_title, pin_description, hashtags.
No preamble, no code fences, no explanation.

Constraints:
- Never claim health benefits ("healthy", "weight loss", "diet").
- Never say "AI-generated" or reference automation.
- Brand voice: practical, slightly dry, never breathless.`;

function userPromptFor(r: SampleRecipe): string {
  return `Recipe: ${r.title}
Cuisine: ${r.cuisine} | Time: ${r.total_time} | Difficulty: ${r.difficulty}
Key ingredients: ${r.top_ingredients.join(', ')}`;
}

type ParseResult =
  | { ok: true; pin_title: string; pin_description: string; hashtags: string[]; raw: string }
  | { ok: false; reason: string; raw: string };

function validateShape(parsed: unknown, raw: string): ParseResult {
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    typeof (parsed as Record<string, unknown>).pin_title === 'string' &&
    typeof (parsed as Record<string, unknown>).pin_description === 'string' &&
    Array.isArray((parsed as Record<string, unknown>).hashtags) &&
    ((parsed as { hashtags: unknown[] }).hashtags).every((h) => typeof h === 'string')
  ) {
    const p = parsed as { pin_title: string; pin_description: string; hashtags: string[] };
    if (p.pin_title.length > 100) return { ok: false, reason: `pin_title too long (${p.pin_title.length})`, raw };
    if (p.pin_description.length < 100 || p.pin_description.length > 500) return { ok: false, reason: `pin_description length out of range (${p.pin_description.length})`, raw };
    if (p.hashtags.length < 3 || p.hashtags.length > 8) return { ok: false, reason: `hashtags count out of range (${p.hashtags.length})`, raw };
    return { ok: true, pin_title: p.pin_title, pin_description: p.pin_description, hashtags: p.hashtags, raw };
  }
  return { ok: false, reason: 'parsed but missing/wrong-type fields', raw };
}

function tryParse(text: unknown): ParseResult {
  // Workers AI Llama 3.3 70B returns an already-parsed object in `response` when the prompt asks for JSON.
  if (text && typeof text === 'object') {
    return validateShape(text, JSON.stringify(text));
  }
  if (typeof text !== 'string') {
    return { ok: false, reason: `non-string, non-object response: ${typeof text}`, raw: String(text) };
  }
  const trimmed = text.trim();
  // Strategy 1: parse as-is
  const candidates: string[] = [trimmed];
  // Strategy 2: strip code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  // Strategy 3: find first {...} block
  const braceMatch = trimmed.match(/\{[\s\S]*\}/);
  if (braceMatch) candidates.push(braceMatch[0]);

  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const result = validateShape(parsed, text);
      if (result.ok) return result;
      // shape failed for this candidate but we got something parseable — return the shape error
      return result;
    } catch {
      // try next candidate
    }
  }
  return { ok: false, reason: 'no parseable JSON in response', raw: text };
}

async function spikeA(env: Env): Promise<Response> {
  const model = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const results: Array<{
    index: number;
    recipe: string;
    parsed: ParseResult;
    elapsed_ms: number;
  }> = [];

  for (let i = 0; i < SAMPLE_RECIPES.length; i++) {
    const recipe = SAMPLE_RECIPES[i];
    const t0 = Date.now();
    try {
      const result = (await env.AI.run(model, {
        messages: [
          { role: 'system', content: PINTEREST_PROMPT_SYSTEM },
          { role: 'user', content: userPromptFor(recipe) },
        ],
        max_tokens: 600,
        temperature: 0.7,
      })) as Record<string, unknown>;
      const elapsed = Date.now() - t0;
      // Llama on Workers AI returns shape variants:
      //   - { response: "...string..." }    classic
      //   - { response: {...object...} }    when prompt asks for JSON, model returns parsed
      //   - { choices: [{ message: { content: "..." } }] }   OpenAI-compat path
      let payload: unknown = undefined;
      if (result?.response !== undefined) {
        payload = result.response;
      } else if (Array.isArray((result as { choices?: unknown[] })?.choices)) {
        payload = (result as { choices: Array<{ message?: { content?: string } }> }).choices[0]?.message?.content;
      } else {
        payload = result;
      }
      const parsed = tryParse(payload);
      results.push({ index: i, recipe: recipe.title, parsed, elapsed_ms: elapsed });
    } catch (err) {
      results.push({
        index: i,
        recipe: recipe.title,
        parsed: { ok: false, reason: `worker error: ${err instanceof Error ? err.message : String(err)}`, raw: '' },
        elapsed_ms: Date.now() - t0,
      });
    }
  }

  const passed = results.filter((r) => r.parsed.ok).length;
  const total = results.length;
  const avgLatency = Math.round(results.reduce((s, r) => s + r.elapsed_ms, 0) / total);

  return Response.json({
    spike: 'A',
    model,
    total,
    passed,
    pass_rate: passed / total,
    avg_latency_ms: avgLatency,
    results,
  });
}

const IMAGE_PROMPTS: Array<{ slot: string; prompt: string }> = [
  { slot: 'hero_pasta', prompt: 'overhead photograph of a bowl of spaghetti carbonara, glossy sauce, freshly cracked black pepper, parmesan shavings, soft natural daylight, rustic wooden table, shallow depth of field, food photography, 35mm lens, no text' },
  { slot: 'hero_curry', prompt: 'overhead photograph of chicken tikka masala in a copper bowl, vibrant orange sauce, fresh cilantro garnish, basmati rice on the side, naan bread, warm soft daylight, rustic wooden surface, food photography, no text' },
  { slot: 'hero_cookies', prompt: 'overhead photograph of golden chocolate chip cookies on a wire cooling rack, melty chocolate chunks, soft daylight, parchment paper, food photography, shallow depth of field, no text' },
  { slot: 'finished_taco', prompt: 'three-quarter angle photograph of three al pastor tacos on a metal plate, charred pineapple cubes, cilantro and white onion, lime wedges, warm cinematic light, casual rustic styling, food photography, no text' },
  { slot: 'finished_risotto', prompt: 'overhead photograph of a creamy saffron risotto in a wide ceramic bowl, golden hue, parmesan shavings on top, soft natural daylight, marble surface, food photography, shallow depth of field, no text' },
  { slot: 'ingredient_garlic', prompt: 'top-down studio photograph of one whole garlic bulb and three garlic cloves on a plain off-white surface, soft daylight, no shadows, isolated, food photography, no text' },
  { slot: 'ingredient_eggs', prompt: 'top-down studio photograph of three brown eggs on a plain off-white surface, soft daylight, isolated, food photography, no text' },
  { slot: 'ingredient_lemon', prompt: 'top-down studio photograph of two whole lemons and one lemon half on a plain off-white surface, soft daylight, isolated, food photography, no text' },
  { slot: 'step_chopping', prompt: 'overhead photograph of hands chopping fresh herbs on a wooden cutting board with a chefs knife, soft daylight, food photography, no faces visible, no text' },
  { slot: 'step_pan', prompt: 'overhead photograph of vegetables sauteing in a black cast iron pan, gentle steam rising, gas stovetop, food photography, no text' },
];

async function spikeB(env: Env): Promise<Response> {
  const models = [
    '@cf/black-forest-labs/flux-1-schnell',
    '@cf/black-forest-labs/flux-2-klein-4b',
  ];

  const results: Array<{
    model: string;
    slot: string;
    prompt: string;
    elapsed_ms: number;
    image_b64?: string;
    bytes?: number;
    error?: string;
  }> = [];

  for (const model of models) {
    for (const { slot, prompt } of IMAGE_PROMPTS) {
      const t0 = Date.now();
      try {
        const out = (await env.AI.run(model, {
          prompt,
          steps: 4,
        })) as { image?: string } | ReadableStream | ArrayBuffer | Uint8Array;
        const elapsed = Date.now() - t0;

        let imageB64: string | undefined;
        let bytes: number | undefined;

        if (out && typeof (out as { image?: string }).image === 'string') {
          imageB64 = (out as { image: string }).image;
          bytes = Math.round((imageB64.length * 3) / 4);
        } else if (out instanceof ReadableStream) {
          const buf = await new Response(out).arrayBuffer();
          bytes = buf.byteLength;
          imageB64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        } else if (out instanceof ArrayBuffer) {
          bytes = out.byteLength;
          imageB64 = btoa(String.fromCharCode(...new Uint8Array(out)));
        }

        results.push({ model, slot, prompt, elapsed_ms: elapsed, image_b64: imageB64, bytes });
      } catch (err) {
        results.push({
          model,
          slot,
          prompt,
          elapsed_ms: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return Response.json({
    spike: 'B',
    models,
    total: results.length,
    succeeded: results.filter((r) => !r.error).length,
    avg_latency_ms: Math.round(results.reduce((s, r) => s + r.elapsed_ms, 0) / results.length),
    results,
  });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/spike-a') return spikeA(env);
    if (url.pathname === '/spike-b') return spikeB(env);
    return new Response('rr-social-spike. routes: /spike-a, /spike-b', { status: 200 });
  },
} satisfies ExportedHandler<Env>;
