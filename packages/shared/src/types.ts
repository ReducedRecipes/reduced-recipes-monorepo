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
  /** ISO 639-1 language code of the original recipe (e.g., 'de', 'fr', 'ja'). */
  original_language?: string;
  /** Title in the original language before translation. */
  original_title?: string;
  /** Content reduction stats — how much bloat we removed. */
  reduction?: {
    /** Total visible words on the original page. */
    original_words: number;
    /** Words in the extracted recipe (ingredients + instructions). */
    recipe_words: number;
    /** Words removed (original - recipe). */
    words_removed: number;
    /** Percentage of content that was bloat. */
    bloat_percent: number;
    /** Number of ad/tracking scripts detected. */
    ads_detected: number;
  };
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

/** A follow relationship between two users. */
export interface Follow {
  follower_id: string;
  following_id: string;
  created_at: string;
}

/** A bookmark sync action sent from mobile clients during offline sync. */
export interface BookmarkSyncAction {
  recipe_id: string;
  collection_id: string | null;
  action: 'add' | 'remove';
  client_timestamp: string;
}

/** Result of a single bookmark sync action from the server. */
export interface BookmarkSyncResult {
  recipe_id: string;
  status: 'applied' | 'conflict';
  server_state?: { exists: boolean; updated_at: string };
}

/** A user's shopping list. */
export interface ShoppingList {
  id: string;
  user_id: string;
  collection_id: string | null;
  name: string;
  is_default: number;
  share_token: string | null;
  share_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Association between a shopping list and a recipe. */
export interface ShoppingListRecipe {
  shopping_list_id: string;
  recipe_id: string;
  added_at: string;
}

/** An item within a shopping list. */
export interface ShoppingListItem {
  id: string;
  shopping_list_id: string;
  recipe_id: string | null;
  original_text: string;
  quantity: number | null;
  unit: string | null;
  item: string | null;
  checked: number;
  parse_failed: number;
  parsing: number;
  source: 'recipe' | 'manual';
  position: number;
  created_at: string;
  updated_at: string;
}

/** Job enqueued for ingredient parsing. */
export interface IngredientParseJob {
  shopping_list_id: string;
  recipe_id: string;
  items: { id: string; original_text: string }[];
}

/** A sync action for shopping list items. */
export interface ShoppingListItemSyncAction {
  shopping_list_id: string;
  type: 'check_item' | 'add_item' | 'remove_item' | 'update_quantity';
  item_id?: string;
  text?: string;
  checked?: boolean;
  quantity?: number;
  client_timestamp: string;
}

/** Result of a single shopping list item sync action. */
export interface ShoppingListItemSyncResult {
  item_id?: string;
  status: 'applied' | 'conflict';
  server_state?: ShoppingListItem;
}

/** WebSocket message from client to server. */
export type ClientMessage =
  | { type: 'add_item'; item: { text: string } }
  | { type: 'check_item'; item_id: string; checked: boolean }
  | { type: 'remove_item'; item_id: string }
  | { type: 'update_quantity'; item_id: string; quantity: number }
  | { type: 'uncheck_all' }
  | { type: 'reconnect'; last_seq: number };

/** WebSocket message from server to client. */
export type ServerMessage =
  | { type: 'state'; items: ShoppingListItem[]; seq: number }
  | { type: 'item_added'; item: ShoppingListItem; seq: number }
  | { type: 'item_checked'; item_id: string; checked: boolean; seq: number }
  | { type: 'item_removed'; item_id: string; seq: number }
  | { type: 'item_updated'; item: ShoppingListItem; seq: number }
  | { type: 'all_unchecked'; seq: number }
  | { type: 'parsing_complete'; items: ShoppingListItem[]; seq: number }
  | { type: 'error'; message: string };

/** Source item contributing to a smart rollup entry. */
export interface SmartRollupSource {
  item_id: string;
  recipe_id: string | null;
  quantity: number | null;
  original_text: string | null;
}

/** A single rolled-up ingredient in the smart rollup view. */
export interface SmartRollupItem {
  canonical_item: string;
  display_text: string;
  total_quantity: number | null;
  unit: string | null;
  sources: SmartRollupSource[];
  parsing?: boolean;
}

/** Response shape for the smart rollup endpoint. */
export interface SmartRollupResponse {
  items: { unchecked: SmartRollupItem[]; checked: SmartRollupItem[] };
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
