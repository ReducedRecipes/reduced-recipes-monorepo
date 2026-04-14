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
  cook_time: number | null;
  tags: string[];
  cuisine: string | null;
  yields: string | null;
  category: string | null;
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
  html: string;
}

/** Job enqueued to the projection queue. */
export interface ProjectionJob {
  id: string;
  doc: RecipeDocument;
}
