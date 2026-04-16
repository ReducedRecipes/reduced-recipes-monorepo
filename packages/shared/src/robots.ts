import type { Env } from './env';

/**
 * Check if a URL is allowed by the domain's robots.txt.
 * Results are cached in CACHE_KV for 24 hours (1 hour on error).
 */
export async function checkRobots(url: string, domain: string, env: Env): Promise<boolean> {
  const cacheKey = `robots:${domain}`;
  const cached = await env.CACHE_KV.get(cacheKey);

  if (cached !== null) return cached === 'true';

  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { 'User-Agent': 'ReducedRecipesBot/1.0' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      // No robots.txt = allowed
      await env.CACHE_KV.put(cacheKey, 'true', { expirationTtl: 86400 });
      return true;
    }

    const text = await res.text();
    const allowed = parseRobots(text, url, 'ReducedRecipesBot');

    await env.CACHE_KV.put(cacheKey, String(allowed), { expirationTtl: 86400 });
    return allowed;
  } catch {
    // Network error fetching robots.txt — assume allowed, cache briefly
    await env.CACHE_KV.put(cacheKey, 'true', { expirationTtl: 3600 });
    return true;
  }
}

/**
 * Parse robots.txt content and check if a URL path is allowed for a given bot.
 * Handles User-agent blocks with Disallow rules and wildcard (*) agent.
 */
export function parseRobots(robotsTxt: string, targetUrl: string, botName: string): boolean {
  const lines = robotsTxt.split('\n').map(l => l.trim());
  const path = new URL(targetUrl).pathname;

  let inRelevantBlock = false;

  for (const line of lines) {
    if (line.toLowerCase().startsWith('user-agent:')) {
      const agent = line.slice(line.indexOf(':') + 1).trim().toLowerCase();
      inRelevantBlock = agent === '*' || agent === botName.toLowerCase();
    }

    if (!inRelevantBlock) continue;

    if (line.toLowerCase().startsWith('disallow:')) {
      const disallowed = line.slice(line.indexOf(':') + 1).trim();
      if (disallowed && path.startsWith(disallowed)) return false;
    }
  }

  return true;
}
