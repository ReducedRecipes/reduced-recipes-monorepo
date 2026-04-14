import type { RecipeDocument, RecipeSummary } from "@rr/shared";

const BASE_URL = `${import.meta.env.VITE_API_BASE || ""}/api/v1`;

interface ApiError {
  error: { code: number; message: string };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new Error(
      body?.error?.message ?? `API error ${res.status}: ${res.statusText}`,
    );
  }
  return res.json() as Promise<T>;
}

export function fetchRecipe(id: string): Promise<RecipeDocument> {
  return apiFetch<RecipeDocument>(`/recipes/${encodeURIComponent(id)}`);
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

function buildQuery(params: { [key: string]: string | number | undefined }): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

export function fetchRecipes(
  params: RecipeListParams = {},
): Promise<RecipeListResponse> {
  return apiFetch<RecipeListResponse>(`/recipes${buildQuery({ ...params })}`);
}

export function searchRecipes(
  q: string,
  limit?: number,
): Promise<RecipeSummary[]> {
  return apiFetch<RecipeSummary[]>(`/search${buildQuery({ q, limit })}`);
}

export function fetchTags(): Promise<{ tag: string; count: number }[]> {
  return apiFetch<{ tag: string; count: number }[]>("/tags");
}

export function fetchDomains(): Promise<
  { domain: string; recipe_count: number; last_spidered: string }[]
> {
  return apiFetch<
    { domain: string; recipe_count: number; last_spidered: string }[]
  >("/domains");
}

export function fetchDomainRecipes(
  domain: string,
  params: Omit<RecipeListParams, "domain"> = {},
): Promise<RecipeListResponse> {
  return apiFetch<RecipeListResponse>(
    `/domains/${encodeURIComponent(domain)}/recipes${buildQuery({ ...params })}`,
  );
}

export function submitRemoval(data: {
  url: string;
  email: string;
  reason: string;
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/remove", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}
