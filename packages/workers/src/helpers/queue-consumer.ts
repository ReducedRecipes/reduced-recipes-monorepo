/**
 * Queue consumer for ingredient parsing jobs.
 *
 * Processes IngredientParseJob messages from the INGREDIENT_PARSE_QUEUE:
 * 1. Parses each ingredient using rule-based parseIngredient
 * 2. Falls back to parseIngredientWithAI when rule-based returns no quantity AND no unit
 * 3. Batch-updates items in D1 with parsed data, sets parsing=0
 */

import type { Env } from '@rr/shared/env';
import type { IngredientParseJob } from '@rr/shared';
import { parseIngredient, parseIngredientWithAI } from './ingredient-parser';

export async function handleIngredientParseQueue(
  batch: MessageBatch<IngredientParseJob>,
  env: Env,
): Promise<void> {
  for (const message of batch.messages) {
    const job = message.body;

    try {
      const updates: Array<{
        id: string;
        item: string;
        quantity: number | null;
        unit: string;
        parse_failed: number;
      }> = [];

      for (const entry of job.items) {
        const ruleBased = parseIngredient(entry.original_text);

        let finalResult = ruleBased;

        // Fall back to AI when rule-based returns no quantity AND no unit
        if (ruleBased.quantity === null && ruleBased.unit === '' && env.AI) {
          finalResult = await parseIngredientWithAI(entry.original_text, env.AI);
        }

        updates.push({
          id: entry.id,
          item: finalResult.name,
          quantity: finalResult.quantity,
          unit: finalResult.unit,
          parse_failed: finalResult.name === '' ? 1 : 0,
        });
      }

      // Batch update items in D1
      const stmts = updates.map((u) =>
        env.USERS_DB!.prepare(
          'UPDATE shopping_list_items SET item = ?, quantity = ?, unit = ?, parse_failed = ?, parsing = 0, updated_at = ? WHERE id = ?',
        ).bind(u.item, u.quantity, u.unit, u.parse_failed, new Date().toISOString(), u.id),
      );

      if (stmts.length > 0) {
        await env.USERS_DB!.batch(stmts);
      }

      message.ack();
    } catch {
      message.retry();
    }
  }
}
