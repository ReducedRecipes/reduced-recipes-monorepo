/**
 * Centralised Workers AI model IDs.
 *
 * Keep every `ai.run(...)` call site pointing at a constant here so a model
 * deprecation is a one-line fix instead of a hunt across helpers. The plain
 * `@cf/meta/llama-3.1-8b-instruct` was deprecated by Workers AI on 2026-05-30
 * (AiError 5028) and silently broke translation and nutrition estimation; the
 * FP8 variant is the current in-family drop-in.
 */
export const TEXT_GEN_MODEL = '@cf/meta/llama-3.1-8b-instruct-fp8' as const;
