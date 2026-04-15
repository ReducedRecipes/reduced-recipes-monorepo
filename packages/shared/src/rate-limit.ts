/**
 * KV-based token bucket rate limiter per domain.
 *
 * Uses a time-window key pattern: rl:{domain}:{window}
 * where window = floor(now_ms / delayMs).
 *
 * If the key exists, the domain is rate limited.
 * If absent, sets the key and allows the request.
 */

/**
 * Check if a domain is currently rate limited.
 * Returns true if the request should proceed, false if rate limited.
 */
export async function checkRateLimit(
  domain: string,
  delayMs: number,
  cacheKv: KVNamespace,
): Promise<boolean> {
  const window = Math.floor(Date.now() / delayMs);
  const windowKey = `rl:${domain}:${window}`;
  const slot = await cacheKv.get(windowKey);

  if (slot !== null) {
    return false; // rate limited
  }

  await cacheKv.put(windowKey, '1', {
    expirationTtl: Math.max(Math.ceil(delayMs / 1000) * 2, 60),
  });

  return true; // allowed
}
