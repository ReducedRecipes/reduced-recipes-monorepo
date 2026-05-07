import type { Notifier, DailyDigestInput, AlertInput } from './types';
import { renderDigestText, renderDigestHtml } from './render-digest';

export interface EmailEnv {
  NOTIFIER_FROM: string;
  NOTIFIER_TO: string;
  NOTIFIER_FROM_NAME?: string;
}

export class EmailNotifier implements Notifier {
  constructor(private env: EmailEnv) {}

  async sendDailyDigest(input: DailyDigestInput): Promise<void> {
    const subject = `${input.drafts.length} social drafts ready (${input.date})`;
    await this.send(subject, renderDigestText(input), renderDigestHtml(input));
  }

  async sendAlert(input: AlertInput): Promise<void> {
    const prefix = { info: 'INFO', warn: 'WARN', error: 'ERROR' }[input.level];
    await this.send(`[${prefix}] ${input.subject}`, input.body, undefined);
  }

  private async send(subject: string, text: string, html: string | undefined): Promise<void> {
    const resp = await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: this.env.NOTIFIER_TO }] }],
        from: {
          email: this.env.NOTIFIER_FROM,
          name: this.env.NOTIFIER_FROM_NAME ?? 'ReducedRecipes Social',
        },
        subject,
        content: [
          { type: 'text/plain', value: text },
          ...(html ? [{ type: 'text/html', value: html }] : []),
        ],
      }),
    });
    if (!resp.ok) {
      throw new Error(`MailChannels send failed: ${resp.status} ${await resp.text()}`);
    }
  }
}
