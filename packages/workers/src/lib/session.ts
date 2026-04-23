/**
 * Session management helpers for Phase 1a authentication.
 *
 * Token format: {uuid_v4}.{timestamp_hex}
 * Session KV key: session:{token} with 30-day TTL
 * Reverse index: user-sessions:{user_id} JSON array of tokens
 */

const SESSION_TTL = 365 * 24 * 60 * 60; // 1 year in seconds

export interface Session {
  user_id: string;
  created_at: number;
  refreshed_at?: number;
}

export interface GraceSession {
  replacement_token: string;
}

export type SessionResult = Session | GraceSession | null;

function generateToken(): string {
  const uuid = crypto.randomUUID();
  const timestampHex = Date.now().toString(16);
  return `${uuid}.${timestampHex}`;
}

function sessionKey(token: string): string {
  return `session:${token}`;
}

function reverseIndexKey(userId: string): string {
  return `user-sessions:${userId}`;
}

export async function createSession(
  kv: KVNamespace,
  userId: string,
): Promise<{ token: string }> {
  const token = generateToken();
  const session: Session = {
    user_id: userId,
    created_at: Date.now(),
  };

  await kv.put(sessionKey(token), JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });

  // Update reverse index
  const existing = await kv.get(reverseIndexKey(userId));
  const tokens: string[] = existing ? JSON.parse(existing) : [];
  tokens.push(token);
  await kv.put(reverseIndexKey(userId), JSON.stringify(tokens));

  return { token };
}

export async function getSession(
  kv: KVNamespace,
  token: string,
): Promise<SessionResult> {
  const raw = await kv.get(sessionKey(token));
  if (!raw) return null;

  const data = JSON.parse(raw);

  // Grace-period replacement: old token points to new token
  if (data.replacement_token) {
    return { replacement_token: data.replacement_token } as GraceSession;
  }

  // Refresh TTL on every read — active users never expire
  const session = data as Session;
  session.refreshed_at = Date.now();
  kv.put(sessionKey(token), JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  }).catch(() => {}); // fire-and-forget

  return session;
}

export async function deleteSession(
  kv: KVNamespace,
  token: string,
  userId: string,
): Promise<void> {
  await kv.delete(sessionKey(token));

  // Remove from reverse index
  const existing = await kv.get(reverseIndexKey(userId));
  if (existing) {
    const tokens: string[] = JSON.parse(existing);
    const updated = tokens.filter((t) => t !== token);
    if (updated.length > 0) {
      await kv.put(reverseIndexKey(userId), JSON.stringify(updated));
    } else {
      await kv.delete(reverseIndexKey(userId));
    }
  }
}

export async function updateSessionIndex(
  kv: KVNamespace,
  userId: string,
  oldToken: string,
  newToken: string,
): Promise<void> {
  const existing = await kv.get(reverseIndexKey(userId));
  const tokens: string[] = existing ? JSON.parse(existing) : [];
  const updated = tokens.map((t) => (t === oldToken ? newToken : t));
  await kv.put(reverseIndexKey(userId), JSON.stringify(updated));
}

export async function deleteAllSessions(
  kv: KVNamespace,
  userId: string,
): Promise<void> {
  const existing = await kv.get(reverseIndexKey(userId));
  if (!existing) return;

  const tokens: string[] = JSON.parse(existing);
  await Promise.all(tokens.map((token) => kv.delete(sessionKey(token))));
  await kv.delete(reverseIndexKey(userId));
}
