export type Platform = 'pinterest' | 'instagram' | 'youtube' | 'tiktok';

export type DraftStatus =
  | 'pending_approval' | 'approved' | 'rejected'
  | 'scheduled' | 'published' | 'failed';

// --- Social tables (mine, defined in ticket 001) ---

export interface SocialSourceCandidate {
  id: string;
  recipe_id: string;
  selection_reason: 'trending' | 'seasonal' | 'editorial' | 'longtail';
  selection_score: number;
  theme: string | null;
  selected_at: number;
}

export interface SocialDraftRow {
  id: string;
  source_id: string;
  platform: Platform;
  variant_label: string | null;
  caption: string | null;
  hashtags: string | null;             // JSON-encoded
  hook: string | null;
  script: string | null;
  cta_text: string | null;
  cta_url: string | null;
  asset_r2_keys: string;               // JSON-encoded
  prompt_version: string;
  model: string;
  generation_cost_usd: number | null;
  status: DraftStatus;
  rejection_reason: string | null;
  approved_at: number | null;
  scheduled_for: number | null;
  created_at: number;
}

export interface SocialDraft extends Omit<SocialDraftRow, 'hashtags' | 'asset_r2_keys'> {
  hashtags: string[];
  asset_r2_keys: string[];
}

export function rowToDraft(row: SocialDraftRow): SocialDraft {
  return {
    ...row,
    hashtags: row.hashtags ? JSON.parse(row.hashtags) : [],
    asset_r2_keys: JSON.parse(row.asset_r2_keys),
  };
}

export interface SocialPost {
  id: string;
  draft_id: string;
  platform: Platform;
  platform_post_id: string;
  permalink: string | null;
  short_link: string;
  published_at: number;
}

export interface SocialMetricsSnapshot {
  id: string; post_id: string; captured_at: number; age_hours: number;
  impressions: number | null; reach: number | null;
  likes: number | null; comments: number | null;
  shares: number | null; saves: number | null;
  click_throughs: number | null; video_views: number | null;
  video_avg_watch_seconds: number | null;
}

export interface IngredientCacheRow {
  ingredient_key: string;
  r2_key: string;
  prompt_version: string;
  model: string;
  generated_at: number;
  bytes: number;
}

// --- Pinterest OAuth (defined in ticket 014, consumed by 009 / 012) ---

export interface PinterestTokenBundle {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  obtainedAt: number;
}

// --- Existing recipes-DB shapes (selector reads these) ---

// Reflects actual columns in `recipes` after migrations 0001-0006 + 0017.
// total_time is INTEGER minutes (NOT a string).
// tags do not live on this row — see RecipeTagRow.
export interface RecipeRow {
  id: string;
  title: string;
  cuisine: string | null;
  total_time: number | null;
  hot_score: number | null;
  original_language: string | null;
  // Joined columns (not on recipes itself):
  save_velocity_7d: number;            // from social_recipe_signals
  search_volume_7d: number;            // from social_recipe_signals
  last_featured_at: number | null;     // computed via subquery
  tags_csv: string | null;             // GROUP_CONCAT subquery on recipe_tags
}

// Junction-table shape, kept here for documentation; reads use GROUP_CONCAT.
export interface RecipeTagRow { recipe_id: string; tag: string }
export interface RecipeIngredientRow { recipe_id: string; ingredient: string }

// --- KV-stored full recipe doc (canonical source for ingredients + instructions) ---

// Mirrors the @rr/shared RecipeDocument shape. Adapter Workers fetch this from
// RECIPES_KV via `env.RECIPES_KV.get('recipe:' + id, 'text')`.
export interface RecipeDocument {
  id: string;
  title: string;
  cuisine: string | null;
  total_time: number | null;            // minutes
  yields: string | null;
  ingredients: string[];                // human-readable, with quantities
  instructions: string[];               // numbered steps
  image_url: string | null;
  source_url: string;
  domain: string;
  original_language?: string;
  tags?: string[];                      // optional; use recipe_tags table when authoritative
}

// --- Composition props for the Remotion video template ---

export interface RecipeCardProps {
  hookText: string;
  ingredients: Array<{ label: string; thumbnailR2Key?: string }>;
  steps: Array<{ duration: number; text: string; stillR2Key?: string }>;
  statsText: string;
  ctaText: string;
  heroR2Key?: string;
  finishedR2Key?: string;
  platform: 'reels' | 'shorts' | 'tiktok';
}

// --- Helpers ---

export function formatTotalTime(minutes: number | null): string {
  if (!minutes || minutes <= 0) return '';
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
}
