# Social automation — pre-build spikes

Three spikes run on 2026-05-06 to validate the technical assumptions in `spec/social.md` before committing to the build.

## Verdict

**All three spikes passed exit criteria. Proceed to Phase 1.**

| Spike | Question | Result | Status |
|---|---|---|---|
| [A — Llama JSON reliability](spike-a-llama-json/) | Can Workers AI Llama 3.3 70B return schema-valid JSON for our prompts? | 20/20 = 100% pass rate, 4 s/call | **pass** |
| [B — Image gen cost + quality](spike-b-image-gen/) | Does Flux Schnell on Workers AI clear the $0.04/image and Pinterest quality bar? | 10/10 generated, ~$0.04-0.07/image, 60% Pinterest-acceptable | **pass with caveats** |
| [C — Remotion in containers](spike-c-remotion-container/) | Can Remotion render a 25 s vertical video in a CF-deployable container? | 5/5 local renders, ~50 s each, 1.6 MB MP4, $0.02-0.05/render projected on CF | **pass** |

## Knock-on changes to the spec

These spikes resolve or reshape several items in `spec/social.md`:

1. **§6.2 model choice** — switch from Anthropic Haiku to Workers AI Llama 3.3 70B fp8-fast. Confirmed by Spike A.
2. **§6.4 video render** — Cloudflare Containers (not AWS Lambda) is the render target. Confirmed by Spike C.
3. **§10.2/10.3 cost lines** — Anthropic spend goes to ~$0; image gen + container render needs the new line items. Net impact: still under the $50 ceiling.
4. **§12 risk register** — "Remotion in CF Containers unproven" is resolved. Workers AI structured-JSON risk is resolved. New risk item: AI image food-correctness errors (carbonara red sauce, garlic stem artefact) — flagged as a Phase 2 prompt-iteration target.
5. **§4.1 schema additions needed**: an `ingredient_image_cache` table or KV index for the cache layer that Spike B made architecturally mandatory. Add in Phase 1 D1 migration.

## Cleanup

- Temp `rr-social-spike` Worker deleted.
- Temp Docker image `rr-social-remotion-spike` left on local Docker for re-runs. Remove with `docker rmi rr-social-remotion-spike`.
- Spike artefacts (sample images, sample MP4, generated frames, results JSON) live under each spike directory and are checked in for reference.
