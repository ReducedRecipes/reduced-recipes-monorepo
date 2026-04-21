/**
 * Cloudflare Worker environment bindings.
 *
 * This file is separate from types.ts so that packages without
 * @cloudflare/workers-types (mobile, frontend) can import from
 * @rr/shared without hitting "Cannot find name D1Database" errors.
 */

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

  /** Phase 1a bindings — optional so non-API workers aren't broken. */
  USERS_DB?: D1Database;
  SESSION_KV?: KVNamespace;
  USER_CACHE_KV?: KVNamespace;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_REDIRECT_URI?: string;
  SESSION_SECRET?: string;
  AI?: Ai;

  /** Phase 2 bindings — shopping lists. */
  SHOPPING_LIST_DO?: DurableObjectNamespace;
  INGREDIENT_PARSE_QUEUE?: Queue;

  /** Funding & transparency. */
  FUNDING_DB?: D1Database;
  KOFI_VERIFICATION_TOKEN?: string;

  /** Phase 3 bindings — hot ranking. */
  VOTES_KV?: KVNamespace;
  HOT_DECAY_SECONDS?: string;
  HOT_MIN_VOTES_FEATURED?: string;
  HOT_MIN_TOTAL_VOTES?: string;
  HOT_RATE_LIMIT_PER_DAY?: string;
  HOT_EPOCH?: string;
  WEIGHT_HEART?: string;
  WEIGHT_LIST_ADD?: string;
  WEIGHT_AUTH_VIEW?: string;

  /** Vectorize — semantic search index. */
  VECTORIZE?: VectorizeIndex;
}
