/**
 * Pure bucket logic for the social-metrics worker (ticket 012 / spec §27).
 *
 * Pinterest analytics propagate slowly (1-3h) and recency drives almost all
 * the dashboard signal, so we sample more aggressively in the first 24h and
 * decay to weekly after two weeks. Past 90 days we stop sampling entirely --
 * any further engagement gets folded in by the analytics dashboard reading
 * the most recent snapshot's lifetime numbers.
 */

export type SnapshotBucket = 'hourly' | 'daily' | 'weekly' | 'skip';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** Bucket a post's age (ms since publish) into a sample cadence. */
export function bucketFor(ageMs: number): SnapshotBucket {
  if (ageMs < 24 * HOUR) return 'hourly';
  if (ageMs < 14 * DAY) return 'daily';
  if (ageMs < 90 * DAY) return 'weekly';
  return 'skip';
}

/**
 * Returns true if a post in the given bucket is due for a fresh snapshot.
 * `lastSnapshotMs` is null when no prior snapshot exists.
 */
export function shouldSample(bucket: SnapshotBucket, lastSnapshotMs: number | null): boolean {
  if (bucket === 'skip') return false;
  if (lastSnapshotMs === null) return true;
  const sinceLast = Date.now() - lastSnapshotMs;
  if (bucket === 'hourly') return sinceLast >= HOUR;
  if (bucket === 'daily') return sinceLast >= DAY;
  if (bucket === 'weekly') return sinceLast >= 7 * DAY;
  return false;
}
