import type { Env, ProjectionJob, RecipeDocument } from '@rr/shared';
import { chunk } from '@rr/shared/utils';

export default {
  async queue(batch: MessageBatch<ProjectionJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        const doc: RecipeDocument = msg.body.doc;

        // ── Skip duplicates: same title + domain already exists ───
        const existing = await env.DB.prepare(
          'SELECT id FROM recipes WHERE title = ? AND domain = ? AND id != ? LIMIT 1',
        ).bind(doc.title, doc.domain, doc.id).first<{ id: string }>();

        if (existing) {
          msg.ack();
          continue;
        }

        // ── Skip category/listing pages (not actual recipe URLs) ──
        const urlPath = new URL(doc.source_url).pathname.toLowerCase();
        if (
          urlPath.includes('/category/') ||
          urlPath.includes('/tag/') ||
          urlPath.includes('/page/') ||
          urlPath === '/' ||
          urlPath.endsWith('/recipes/') ||
          urlPath.endsWith('/recipes')
        ) {
          msg.ack();
          continue;
        }

        // ── Build D1 statements ───────────────────────────────────
        const statements: D1PreparedStatement[] = [];

        // 1. Upsert recipe row
        statements.push(
          env.DB.prepare(`
            INSERT OR IGNORE INTO recipes
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

        // 4. Upsert FTS index
        statements.push(
          env.DB.prepare('DELETE FROM recipes_fts WHERE id = ?').bind(doc.id),
        );
        statements.push(
          env.DB.prepare(`
            INSERT INTO recipes_fts (rowid, id, title, tags, author, cuisine)
            VALUES (
              (SELECT rowid FROM recipes WHERE id = ?),
              ?, ?, ?, ?, ?
            )
          `).bind(
            doc.id,
            doc.id,
            doc.title,
            doc.tags.slice(0, 20).join(' '),
            doc.author ?? '',
            doc.cuisine ?? '',
          ),
        );

        // 5. Increment domain counter
        statements.push(
          env.DB.prepare(`
            UPDATE domains
            SET recipe_count = recipe_count + 1,
                last_spidered = datetime('now')
            WHERE domain = ?
          `).bind(doc.domain),
        );

        // 6. Batch execute — chunk into groups of 100
        const batches = chunk(statements, 100);
        for (const batch of batches) {
          await env.DB.batch(batch);
        }

        msg.ack();
      } catch {
        msg.retry();
      }
    }
  },
};
