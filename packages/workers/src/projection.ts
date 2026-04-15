import type { Env, ProjectionJob, RecipeDocument } from '@rr/shared';
import { chunk } from '@rr/shared/utils';

export default {
  async queue(batch: MessageBatch<ProjectionJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        await processMessage(msg.body, env);
      } catch (err) {
        console.error('[projection] ERROR:', err instanceof Error ? err.message : String(err));
      }
      msg.ack();
    }
  },
};

async function processMessage(body: ProjectionJob, env: Env) {
  const doc: RecipeDocument = body.doc;
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
      doc.id, doc.source_url, doc.domain, doc.title, doc.image_url,
      doc.author, doc.yields, doc.prep_time, doc.cook_time, doc.total_time,
      doc.cuisine, doc.category, doc.schema_valid ? 1 : 0, doc.extracted_at,
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
    env.DB.prepare(
      'INSERT INTO recipes_fts(id, title, tags, author, cuisine) VALUES (?, ?, ?, ?, ?)',
    ).bind(
      doc.id, doc.title, doc.tags.slice(0, 20).join(' '),
      doc.author ?? '', doc.cuisine ?? '',
    ),
  );

  // 5. Increment domain counter
  statements.push(
    env.DB.prepare(`
      UPDATE domains SET recipe_count = recipe_count + 1, last_spidered = datetime('now')
      WHERE domain = ?
    `).bind(doc.domain),
  );

  // 6. Batch execute
  for (const batch of chunk(statements, 100)) {
    await env.DB.batch(batch);
  }
}
