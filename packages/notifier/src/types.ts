import type { Platform, DraftStatus } from '@rr/social-shared';

export interface DraftSummary {
  id: string;
  platform: Platform;
  hook?: string;
  caption?: string;
  hashtags?: string[];
  scheduledFor?: number;
  previewUrl?: string;
  status: DraftStatus;
}

export interface DailyDigestInput {
  drafts: DraftSummary[];
  approveBaseUrl: string;
  oneClickApproveBaseUrl: string;
  date: string;
}

export interface AlertInput {
  level: 'info' | 'warn' | 'error';
  subject: string;
  body: string;
}

export interface Notifier {
  sendDailyDigest(input: DailyDigestInput): Promise<void>;
  sendAlert(input: AlertInput): Promise<void>;
}
