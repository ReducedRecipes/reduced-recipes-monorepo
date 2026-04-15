export const routes = {
  recipe: (id: string) => `/recipe/${id}` as const,
  cook: (id: string) => `/cook/${id}` as const,
  tag: (tag: string) => `/tag/${tag}` as const,
  cuisine: (cuisine: string) => `/cuisine/${cuisine}` as const,
  site: (domain: string) => `/site/${domain}` as const,
  onboarding: "/onboarding" as const,
} as const;
