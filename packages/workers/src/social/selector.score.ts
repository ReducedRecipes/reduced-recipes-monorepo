// Pure scoring helpers for the social-selector worker.
//
// Kept side-effect-free so the unit tests can exercise the math directly
// without standing up a D1 mock. See spec/social.md §4.1 for the weights and
// §21 for the surrounding selector pipeline.

export interface ScoreInputs {
  saveVelocity7d: number;
  searchVolume7d: number;
  seasonalityMatch: number;
  editorialThemeMatch: number;
  longtailFreshness: number;
  recentlyPosted: 0 | 1;
}

// Exported as `const` so tests can import and assert exact bumps/penalties
// instead of magic numbers.
export const WEIGHTS = {
  save: 0.40,
  search: 0.20,
  seasonal: 0.15,
  editorial: 0.15,
  longtail: 0.10,
  recencyPenalty: 0.30,
} as const;

export function score(i: ScoreInputs): number {
  return (
    WEIGHTS.save * i.saveVelocity7d +
    WEIGHTS.search * i.searchVolume7d +
    WEIGHTS.seasonal * i.seasonalityMatch +
    WEIGHTS.editorial * i.editorialThemeMatch +
    WEIGHTS.longtail * i.longtailFreshness -
    WEIGHTS.recencyPenalty * i.recentlyPosted
  );
}

// Returns 1 if any tag matches a season-aware bucket for the given date,
// else 0. Wrap-around ranges (e.g. winter spans Dec→Feb) are handled with
// OR logic when `from > to`.
export function seasonalityMatch(recipeTags: string[], date: Date): number {
  const month = date.getUTCMonth() + 1;
  const seasonalTags: Record<string, [number, number]> = {
    summer: [6, 8],
    winter: [12, 2],
    spring: [3, 5],
    autumn: [9, 11],
    grilling: [6, 8],
    holiday: [11, 12],
    christmas: [12, 12],
    'no-bake': [6, 8],
    soup: [10, 3],
    braise: [10, 3],
  };
  let best = 0;
  for (const tag of recipeTags) {
    const range = seasonalTags[tag.toLowerCase()];
    if (!range) continue;
    const [from, to] = range;
    const inSeason = from <= to
      ? month >= from && month <= to
      : month >= from || month <= to;
    if (inSeason) best = Math.max(best, 1.0);
  }
  return best;
}

// Boosts recipes that haven't been featured in a while; capped at 1.0 once
// it's been ~60 days since the last feature. `null` means never featured,
// which scores the maximum.
export function longtailFreshness(daysSinceLastFeatured: number | null): number {
  if (daysSinceLastFeatured === null) return 1.0;
  return Math.min(1, Math.log10(daysSinceLastFeatured + 1) / Math.log10(60));
}
