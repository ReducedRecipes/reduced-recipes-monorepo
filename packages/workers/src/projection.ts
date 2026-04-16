import type { Env } from '@rr/shared/env';
import type { ProjectionJob, RecipeDocument } from '@rr/shared';
import { chunk } from '@rr/shared/utils';
import { inferDietaryBitmask } from './helpers/dietary-inference';

export default {
  async queue(batch: MessageBatch<ProjectionJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        const doc: RecipeDocument = msg.body.doc;

        // ── Build D1 statements ───────────────────────────────────
        const statements: D1PreparedStatement[] = [];

        // 1. Upsert recipe row
        statements.push(
          env.DB.prepare(`
            INSERT OR REPLACE INTO recipes
              (id, source_url, domain, title, image_url, author, yields,
               prep_time, cook_time, total_time, cuisine, category,
               schema_valid, extracted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            doc.id,
            doc.source_url,
            doc.domain,
            doc.title,
            doc.image_url,
            doc.author,
            doc.yields,
            doc.prep_time,
            doc.cook_time,
            doc.total_time,
            doc.cuisine,
            doc.category,
            doc.schema_valid ? 1 : 0,
            doc.extracted_at,
          ),
        );

        // 2. Delete existing tags
        statements.push(
          env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(doc.id),
        );

        // 3. Insert new tags (max 20)
        for (const tag of doc.tags.slice(0, 20)) {
          statements.push(
            env.DB.prepare(
              'INSERT OR IGNORE INTO recipe_tags (recipe_id, tag) VALUES (?, ?)',
            ).bind(doc.id, tag),
          );
        }

        // 4. Increment domain counter
        statements.push(
          env.DB.prepare(`
            UPDATE domains
            SET recipe_count = recipe_count + 1,
                last_spidered = datetime('now')
            WHERE domain = ?
          `).bind(doc.domain),
        );

        // 5. Batch execute — chunk into groups of 100
        const batches = chunk(statements, 100);
        for (const batch of batches) {
          await env.DB.batch(batch);
        }

        // 6. Best-effort dietary inference — runs after recipe is stored
        if (env.AI) {
          try {
            const bitmask = await inferDietaryBitmask(doc, env.AI);
            await env.DB.prepare(
              'UPDATE recipes SET dietary_bitmask = ? WHERE id = ?',
            ).bind(bitmask, doc.id).run();
          } catch (error) {
            console.warn('Dietary inference failed for recipe', doc.id, error);
          }
        }

        msg.ack();
      } catch {
        msg.retry();
      }
    }
  },
};
