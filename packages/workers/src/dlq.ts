import type { Env } from '@rr/shared/env';

interface DlqMessage {
  url?: string;
  [key: string]: unknown;
}

export default {
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const crawlDb = env.CRAWL_DB ?? env.DB;
    for (const msg of batch.messages) {
      try {
        const body = msg.body as DlqMessage;
        const queueName = batch.queue;

        console.error(
          JSON.stringify({
            level: 'error',
            queue: queueName,
            messageId: msg.id,
            timestamp: new Date().toISOString(),
            body: body,
          }),
        );

        // For crawl-dlq messages: mark the URL as failed in crawl_queue
        if (queueName === 'crawl-dlq' && body?.url) {
          await crawlDb.prepare(
            "UPDATE crawl_queue SET status = ?, last_crawled = datetime('now') WHERE url = ?",
          )
            .bind('failed', body.url)
            .run();
        }
      } catch (err) {
        // Log but don't let processing errors prevent ack —
        // DLQ messages must not re-enter the DLQ
        console.error(
          JSON.stringify({
            level: 'error',
            queue: batch.queue,
            messageId: msg.id,
            error: (err as Error).message,
            timestamp: new Date().toISOString(),
          }),
        );
      }

      // Always ack — DLQ is the final stop
      msg.ack();
    }
  },
};
