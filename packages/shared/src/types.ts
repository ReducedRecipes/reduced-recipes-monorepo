/** Full recipe document stored in KV (source of truth). */
export interface RecipeDocument {
  id: string;
  source_url: string;
  domain: string;
  title: string;
  image_url: string | null;
  author: string | null;
  yields: string | null;
  prep_time: number | null;
  cook_time: number | null;
  total_time: number | null;
  ingredients: string[];
  instructions: string[];
  tags: string[];
  cuisine: string | null;
  category: string | null;
  keywords: string[];
  schema_valid: boolean;
  extracted_at: string;
  last_checked: string;
}

/** Lean recipe summary used for list/search views (projected into D1). */
export interface RecipeSummary {
  id: string;
  title: string;
  domain: string;
  image_url: string | null;
  total_time: number | null;
  cook_time: number | null;
  yields: string | null;
  cuisine: string | null;
  category: string | null;
  tags: string[];
}

/** Cloudflare Worker environment bindings. */
export interface Env {
  DB: D1Database;
  RECIPES_KV: KVNamespace;
  CACHE_KV: KVNamespace;
  IMAGES_R2: R2Bucket;
  CRAWL_QUEUE: Queue;
  PARSE_QUEUE: Queue;
  PROJECTION_QUEUE: Queue;
  ADMIN_TOKEN: string;
  BOT_USER_AGENT: string;
  DEFAULT_CRAWL_DELAY_MS: string;
  MAX_QUEUE_BATCH: string;
  ENVIRONMENT: string;

  /* Phase 1a — personalisation bindings (optional so non-API workers aren't broken) */
  USERS_DB?: D1Database;
  SESSION_KV?: KVNamespace;
  USER_CACHE_KV?: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
  AI?: Ai;
}

/** Job enqueued to the crawl queue. */
export interface CrawlJob {
  url: string;
  domain: string;
}

/** Job enqueued to the parse queue. */
export interface ParseJob {
  url: string;
  domain: string;
  html?: string;
  htmlKey?: string;
}

/** Job enqueued to the projection queue. */
export interface ProjectionJob {
  id: string;
  doc: RecipeDocument;
}

/* ── Phase 1a — User & personalisation types ── */

/** User profile stored in the users D1 database. */
export interface User {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  profile_public: number; // 0 or 1
  tier: string; // 'free' | 'premium' etc.
  created_at: string;
  updated_at: string;
}

/** OAuth provider link for a user. */
export interface UserAuthProvider {
  user_id: string;
  provider: string;
  provider_id: string;
  provider_email: string;
  provider_name: string | null;
  provider_avatar: string | null;
}

/** A saved-recipe collection owned by a user. */
export interface Collection {
  id: string;
  user_id: string;
  name: string;
  is_default: number; // 0 or 1
  is_public: number; // 0 or 1
  position: number;
  created_at: string;
  updated_at: string;
}

/** A single bookmarked recipe within a collection. */
export interface Bookmark {
  id: string;
  user_id: string;
  collection_id: string;
  recipe_id: string;
  recipe_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** In-app notification for a user. */
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: string; // JSON blob
  read: number; // 0 or 1
  created_at: string;
}

/** GDPR / consent record. */
export interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: string;
  granted: number; // 0 or 1
  ip_address: string;
  user_agent: string;
  created_at: string;
}

/** Deduplicated recipe view per user per day. */
export interface RecipeView {
  id: string;
  user_id: string;
  recipe_id: string;
  source: string;
  viewed_at: string;
}
