/**
 * US Eastern Pinterest publish slot calculator.
 *
 * NOTE: This file is a verbatim copy of `packages/workers/src/social/scheduling.ts`.
 * Cloudflare Pages Functions don't have a clean way to import from sibling
 * workspace packages without complex bundler config in v1, so we duplicate
 * the source here. Phase 1.5 polish should dedupe by either (a) publishing
 * a `@rr/social-scheduling` package or (b) wiring in a Pages-compatible
 * bundler like the new `_worker.js` mode.
 *
 * Per spec §7.1, Pinterest engagement peaks for our recipe niche at four
 * fixed US Eastern hours: 11:00, 14:00, 20:00, and 21:00. Drafts approved
 * via the email-digest one-click flow (ticket 010) and the swipe admin
 * (ticket 011) are scheduled to the next future slot, with ±20 minutes of
 * jitter so we don't hammer the platform at exact-minute boundaries that
 * automation heuristics flag.
 *
 * v1 hardcodes EST (UTC-5) and ignores DST. Calendar-correct timezone
 * handling is a follow-up; the spec accepts the fixed-offset shortcut.
 */

const ET_OFFSET_MIN = -5 * 60; // EST. DST is a v2 follow-up.
const SLOTS_ET_HHMM = [11 * 60, 14 * 60, 20 * 60, 21 * 60];

/**
 * Returns the next Pinterest publish slot strictly after `now`, with ±20
 * minutes of jitter applied. Wraps to the next day's 11:00 ET slot if no
 * slot remains today.
 */
export function nextPinterestSlot(now: Date = new Date()): Date {
  const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const etMin = ((utcMin + ET_OFFSET_MIN) % 1440 + 1440) % 1440;

  // Add a 5-minute deadband so we don't pick a slot we're already on top of.
  let chosenSlotEtMin: number | undefined = SLOTS_ET_HHMM.find((s) => s > etMin + 5);
  let dayOffset = 0;
  if (chosenSlotEtMin === undefined) {
    chosenSlotEtMin = SLOTS_ET_HHMM[0]!;
    dayOffset = 1;
  }

  const targetEtTotalMin = chosenSlotEtMin + dayOffset * 1440;
  const targetUtcMin = targetEtTotalMin - ET_OFFSET_MIN;
  const baseDate = new Date(now);
  baseDate.setUTCHours(0, 0, 0, 0);
  const targetMs = baseDate.getTime() + targetUtcMin * 60 * 1000;

  const jitterMs = (Math.random() * 40 - 20) * 60 * 1000; // ±20 minutes.
  return new Date(targetMs + jitterMs);
}
