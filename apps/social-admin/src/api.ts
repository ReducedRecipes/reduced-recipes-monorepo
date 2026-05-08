import type { Platform } from '@rr/social-shared';

export interface PendingDraft {
  id: string;
  platform: Platform;
  caption: string;
  hashtags: string[];
  hook: string | null;
  ctaUrl: string;
  pinPreviewUrl: string;
  videoPreviewUrl: string | null;
  createdAt: number;
}

export async function fetchPending(): Promise<PendingDraft[]> {
  const r = await fetch('/api/drafts/pending');
  if (!r.ok) throw new Error(`fetchPending: ${r.status}`);
  return (await r.json()) as PendingDraft[];
}

export async function approve(id: string): Promise<void> {
  const r = await fetch(`/api/drafts/${id}/approve`, { method: 'POST' });
  if (!r.ok) throw new Error(`approve: ${r.status}`);
}

export async function reject(id: string, reason?: string): Promise<void> {
  const r = await fetch(`/api/drafts/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  if (!r.ok) throw new Error(`reject: ${r.status}`);
}

export async function editApprove(
  id: string,
  patch: { caption?: string; hashtags?: string[] },
): Promise<void> {
  const r = await fetch(`/api/drafts/${id}/edit-approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!r.ok) throw new Error(`editApprove: ${r.status}`);
}
