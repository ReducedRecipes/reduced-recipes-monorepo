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

/** User profile stored in users DB. */
export interface User {
  id: string;
  email: string;
  name: string;
  picture_url: string | null;
  profile_public: number;
  tier: string;
  created_at: string;
  updated_at: string;
}

/** External auth provider link for a user. */
export interface UserAuthProvider {
  user_id: string;
  provider: string;
  provider_id: string;
  provider_email: string;
  provider_name: string | null;
  provider_avatar: string | null;
}

/** A user's saved recipe collection. */
export interface Collection {
  id: string;
  user_id: string;
  name: string;
  is_default: number;
  is_public: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** A bookmarked recipe within a collection. */
export interface Bookmark {
  id: string;
  user_id: string;
  collection_id: string;
  recipe_id: string;
  recipe_deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

/** In-app notification. */
export interface Notification {
  id: string;
  user_id: string;
  type: string;
  payload: string;
  read: number;
  created_at: string;
}

/** GDPR consent record. */
export interface ConsentRecord {
  id: string;
  user_id: string;
  consent_type: string;
  granted: number;
  ip_address: string;
  user_agent: string;
  created_at: string;
}

/** Recipe view tracking entry. */
export interface RecipeView {
  id: string;
  user_id: string;
  recipe_id: string;
  source: string;
  viewed_at: string;
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
