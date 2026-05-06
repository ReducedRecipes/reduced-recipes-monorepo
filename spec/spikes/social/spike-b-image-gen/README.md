# Spike B: Workers AI image gen cost + quality

**Date:** 2026-05-06
**Question:** Can Flux on Workers AI produce Pinterest-acceptable food images at ≤$0.04/image, supporting the all-AI path?

## Setup

10 prompts spanning the production prompt classes:

| Slot | Use case |
|---|---|
| `hero_pasta`, `hero_curry`, `hero_cookies` | Pinterest pin hero / finished-dish slot |
| `finished_taco`, `finished_risotto` | Last-frame "finished" hero in Reels/Shorts |
| `ingredient_garlic`, `ingredient_eggs`, `ingredient_lemon` | Animated ingredient stills (reusable, cacheable) |
| `step_chopping`, `step_pan` | Step-card visuals |

Run against:
- `@cf/black-forest-labs/flux-1-schnell` (cheap workhorse)
- `@cf/black-forest-labs/flux-2-klein-4b` (newer distilled)

## Result

| Model | Success | Avg latency | Avg size |
|---|---|---|---|
| flux-1-schnell | **10 / 10** | ~2.0 s | ~544 KB |
| flux-2-klein-4b | 0 / 10 | n/a | n/a |

flux-2-klein-4b expects multipart/form-data input from the AI binding shape we use; the JSON-arg path we hit returns `5006: required properties at '/' are 'multipart'`. Switching to a multipart binding pattern is its own integration cost and not investigated further in this spike. **flux-1-schnell is the production target.**

Per-image rendered output saved to `images/`. Open them and judge yourself.

## Quality assessment (subjective)

| Slot | Verdict |
|---|---|
| `hero_pasta` (carbonara) | **Off** — has red/orange pooling under the pasta, which is wrong for carbonara (it's egg + cheese + pepper, no tomato). A food-savvy viewer notices immediately. |
| `hero_curry` (tikka masala) | **Good at thumbnail.** Chicken pieces look more like meatballs but reads as curry. Naan + rice + cilantro composition is solid. |
| `hero_cookies` | **Excellent.** Reads as professional food photography. Soft daylight, wire rack, parchment, melty chocolate. Pinterest-grade. |
| `finished_taco` (al pastor) | **Good.** Charred pineapple, cilantro, lime wedges, cohesive plate. |
| `finished_risotto` | Acceptable, slightly synthetic. |
| `ingredient_garlic` | **Off** — garlic bulb has a weird wooden-stick stem-like artifact. The cloves are fine. Borderline for ingredient slot. |
| `ingredient_eggs` | Clean. |
| `ingredient_lemon` | Clean. |
| `step_chopping` | **Good.** Real-looking hands, cilantro on cutting board. One of the stronger outputs. |
| `step_pan` | Clean enough. |

**Aggregate read:** ~60% Pinterest-acceptable, ~30% borderline, ~10% with food-correctness errors that matter (carbonara red sauce, garlic stem). At Pinterest scroll speed (<1s viewing), errors are mostly invisible. In Reels/Shorts where viewers see a frame for 2-4 seconds, errors become more noticeable.

## Cost

flux-1-schnell on Workers AI is priced by neurons consumed. Based on published Cloudflare pricing (~6K neurons per ~768×768 generation at $0.011/1K neurons): **roughly $0.04-0.07 per image**, depending on resolution.

At v1 production volume (~150 image generations/day if no caching, all platforms combined): **$6-10/day raw, $180-300/mo.** Over the $50 ceiling.

**Mitigation: aggressive ingredient-image cache in R2.** Generate each canonical ingredient ("garlic", "eggs", "olive oil") once, key by lowercased + normalised name. Reuse across all videos. The corpus has ~2,000 distinct ingredients but the long tail is sparse; the top 200 cover ~80% of recipe usage. After seeding the cache, ongoing cost is hero + finished shots per recipe only:

- 10 recipes/day × 2 fresh shots (hero + finished) × $0.06 = **$1.20/day = $36/mo**

Inside budget. The cache becomes a hard architectural requirement, not a nice-to-have.

## Decision

**Flux-1-schnell is workable for v1 with the ingredient cache.** Hero quality is borderline but acceptable for Pinterest scroll-speed viewing. The §12 "Image rendering quality looks AI-generated" risk is real but not blocking.

The hybrid path (real licensed photos for hero/finished, AI for ingredients/steps) gets a stronger case from this spike. Carbonara with red sauce is exactly the failure mode that erodes food-savvy audience trust. **Recommend revisiting the hybrid path for Phase 2** (after Pinterest baseline is established and you can measure whether the AI hero shots are demoted).

For v1: ship pure-AI as agreed, with two architectural commitments:
1. **Ingredient cache layer in R2** is mandatory, not optional
2. **Quality-screening gate** in the approval UI: if hero shot has obvious food errors, reject. The current prompt iteration cycle catches systematic issues (e.g., never produce red carbonara sauce).

## Next prompt iteration to try in Phase 1

The carbonara failure suggests Flux's prior on "Italian pasta" is biased toward red-sauce dishes. Prompt should explicitly negate (`no tomato sauce, no red sauce, only egg and cheese coating`) for sauce-sensitive dishes. Add a per-cuisine prompt-suffix table.

## Cleanup

The temp `rr-social-spike` Worker is still deployed at `https://rr-social-spike.nikrich.workers.dev` and will be deleted at the end of all spikes.
