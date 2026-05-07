const ASSETS_HOST = 'https://assets.reduced.recipes';
const SHORTLINK_HOST = 'https://r.reduced.recipes';

export function assetUrl(r2Key: string): string {
  if (r2Key.startsWith('/')) r2Key = r2Key.slice(1);
  return `${ASSETS_HOST}/${r2Key}`;
}

export function shortLinkUrl(draftId: string, params: {
  platform: string;
  campaign: string;
}): string {
  const u = new URL(`${SHORTLINK_HOST}/${draftId}`);
  u.searchParams.set('utm_source', params.platform);
  u.searchParams.set('utm_medium', 'organic_social');
  u.searchParams.set('utm_campaign', params.campaign);
  u.searchParams.set('utm_content', draftId);
  return u.toString();
}

export function recipePageUrl(recipeId: string): string {
  return `https://reduced.recipes/recipe/${recipeId}`;
}
