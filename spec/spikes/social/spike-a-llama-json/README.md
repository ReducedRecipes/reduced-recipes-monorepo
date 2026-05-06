# Spike A: Workers AI Llama JSON reliability

**Date:** 2026-05-06
**Question:** Can `@cf/meta/llama-3.3-70b-instruct-fp8-fast` on Workers AI return parseable, schema-valid JSON for our Pinterest caption prompt?

## Setup

20 representative recipes (see `../spike-worker/src/recipes.ts`) sent through the production-shape Pinterest prompt from `spec/social.md` §6.3. Each response validated against:

- `pin_title`: string, ≤100 chars
- `pin_description`: string, 100-500 chars
- `hashtags`: string array, length 3-8

## Result

| Metric | Value |
|---|---|
| Pass rate (first attempt) | **20 / 20 = 100%** |
| Avg latency per call | 4084 ms |
| Model | `@cf/meta/llama-3.3-70b-instruct-fp8-fast` |

Full output in `results.json`.

## Key finding

Workers AI's Llama 3.3 70B **returns a pre-parsed JSON object in `result.response`** when the prompt asks for JSON — no string parsing required. The first parse attempts failed only because the spike code expected `result.response` to be a string. Once the extraction handled both shapes (string and object), reliability hit 100%.

This is different from Anthropic SDK behavior. Adapter Workers should expect:

```ts
const result = await env.AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast', {
  messages: [...],
  max_tokens: 600,
})
const payload = typeof result.response === 'string'
  ? JSON.parse(result.response)
  : result.response
```

## Decision

**Ship as-is. No retry-with-correction layer needed for v1.**

The §12 risk in `social.md` ("Workers AI + structured JSON unreliable, budget extra dev time") is removed. Adapter Workers can trust Llama 3.3 70B to return valid JSON on first attempt for prompts of this shape and size.

Recommend a thin defensive parse + Zod validation as a guardrail (cheap insurance), but no retry/correction loop in v1.

## Sample output (Spaghetti Carbonara)

```json
{
  "pin_title": "Spaghetti Carbonara Fast",
  "pin_description": "Make a classic Italian dish in no time. You'll need just a few ingredients like spaghetti, guanciale, and pecorino to create a rich and creamy carbonara. Perfect for a weeknight dinner or a special occasion, this easy recipe is a great way to practice your pasta-making skills and master Italian cuisine. Get the full recipe — no scrolling through stories.",
  "hashtags": ["#weeknightdinner", "#onepanmeal", "#italianfood", "#pastarecipes", "#carbonara"]
}
```

Quality is OK out of the box. Brand voice tightening (less "perfect for a special occasion" filler, more dryness) needs prompt iteration in Phase 1. Not blocking.

## Cost

Workers AI neuron usage: ~20 calls × Llama 70B fp8-fast tokens. Well inside the free Workers AI neuron allowance on the paid plan. Zero marginal spend on this spike.
