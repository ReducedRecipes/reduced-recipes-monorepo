import type { RecipeDocument, RecipeSummary } from "@rr/shared";

const BASE_URL = `${process.env.EXPO_PUBLIC_API_BASE || "https://reducedrecipes.com"}/api/v1`;

/** Structured API error with status code and message. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Client": "rr-mobile/1.0",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new ApiError(
      res.status,
      body?.error?.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

export interface RecipeListResponse {
  items: RecipeSummary[];
  next_cursor: string | null;
}

export interface RecipeListParams {
  tag?: string;
  domain?: string;
  cuisine?: string;
  max_time?: number;
  min_time?: number;
  cursor?: string;
  limit?: number;
}

export const api = {
  recipes: {
    list(params: RecipeListParams = {}): Promise<RecipeListResponse> {
      return request<RecipeListResponse>(`/recipes${buildQuery({ ...params })}`);
    },

    get(id: string): Promise<RecipeDocument> {
      return request<RecipeDocument>(`/recipes/${encodeURIComponent(id)}`);
    },

    search(q: string, limit?: number): Promise<RecipeSummary[]> {
      return request<RecipeSummary[]>(`/search${buildQuery({ q, limit })}`);
    },
  },

  tags: {
    list(): Promise<{ tag: string; count: number }[]> {
      return request<{ tag: string; count: number }[]>("/tags");
    },
  },
};
