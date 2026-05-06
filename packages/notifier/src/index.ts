import type { Notifier } from './types';
import { EmailNotifier, type EmailEnv } from './email-notifier';

export type { Notifier, DailyDigestInput, AlertInput, DraftSummary } from './types';
export { EmailNotifier } from './email-notifier';
export { renderDigestText, renderDigestHtml } from './render-digest';

export interface NotifierFactoryEnv extends EmailEnv {
  NOTIFIER_CHANNEL?: 'email';
}

export function createNotifier(env: NotifierFactoryEnv): Notifier {
  const channel = env.NOTIFIER_CHANNEL ?? 'email';
  if (channel === 'email') return new EmailNotifier(env);
  throw new Error(`Unknown notifier channel: ${channel}`);
}
