import type { Env } from '@rr/shared/env';
import type { ProjectionJob, RecipeDocument } from '@rr/shared';
import { chunk } from '@rr/shared/utils';
import { inferDietaryBitmask } from './helpers/dietary-inference';
import { translateRecipe } from './helpers/translate';
import { extractIngredientNames } from './helpers/ingredient-extract';

export default {
  async queue(batch: MessageBatch<ProjectionJob>, env: Env) {
    for (const msg of batch.messages) {
      try {
        let doc: RecipeDocument = msg.body.doc;

        // ── Skip duplicates: same title + domain already exists ───
        const existing = await env.DB.prepare(
          'SELECT id FROM recipes WHERE title = ? AND domain = ? AND id != ? LIMIT 1',
        ).bind(doc.title, doc.domain, doc.id).first<{ id: string }>();

        if (existing) {
          msg.ack();
          continue;
        }

        // ── Translate non-English recipes ───────────────────────────
        if (doc.original_language && doc.original_language !== 'en') {
          if (env.AI) {
            try {
              console.log(`TRANSLATING: ${doc.id} (${doc.original_language}) "${doc.title}"`);
              doc = await translateRecipe(doc, env.AI);
              console.log(`TRANSLATED: ${doc.id} → "${doc.title}"`);
            } catch (error) {
              console.error('Translation FAILED:', doc.id, error);
            }
          } else {
            console.warn('NO AI BINDING for translation:', doc.id);
          }
        }

        // ── Update KV with translated doc ────────────────────────
        if (doc.original_language && doc.original_language !== 'en') {
          await env.RECIPES_KV.put(
            `recipe:${doc.id}`,
            JSON.stringify(doc),
            { expirationTtl: 31_536_000 },
          );
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
               schema_valid, extracted_at, original_language)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            doc.original_language ?? null,
          ),
        );

        // 1b. Update reduction stats (works even if INSERT was ignored)
        if (doc.reduction) {
          statements.push(
            env.DB.prepare(
              'UPDATE recipes SET words_removed = ?, ads_detected = ? WHERE id = ?',
            ).bind(doc.reduction.words_removed, doc.reduction.ads_detected, doc.id),
          );
        }

        // 2. Delete existing tags
        statements.push(
          env.DB.prepare('DELETE FROM recipe_tags WHERE recipe_id = ?').bind(doc.id),
        );

        // 3. Insert new tags (max 20) + language origin tag
        const tags = [...doc.tags.slice(0, 20)];
        if (doc.original_language && doc.original_language !== 'en') {
          const langNames: Record<string, string> = {
            it: 'italian', de: 'german', fr: 'french', es: 'spanish',
            pt: 'portuguese', nl: 'dutch', pl: 'polish', tr: 'turkish',
            sv: 'swedish', da: 'danish', no: 'norwegian', hu: 'hungarian',
            ja: 'japanese', ko: 'korean', zh: 'chinese', ru: 'russian',
            el: 'greek', ro: 'romanian', cs: 'czech', hr: 'croatian',
          };
          const langTag = langNames[doc.original_language];
          if (langTag) tags.push(langTag, 'translated');
        }
        for (const tag of tags) {
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

        // 7. Best-effort dietary inference — runs after recipe is stored
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

        // 8. Best-effort ingredient index
        try {
          const ingredientNames = extractIngredientNames(doc.ingredients);
          if (ingredientNames.length > 0) {
            const ingredientStmts: D1PreparedStatement[] = [];
            ingredientStmts.push(
              env.DB.prepare('DELETE FROM recipe_ingredients WHERE recipe_id = ?').bind(doc.id),
            );
            for (const name of ingredientNames) {
              ingredientStmts.push(
                env.DB.prepare(
                  'INSERT INTO ingredients (name, count) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET count = count + 1',
                ).bind(name),
              );
              ingredientStmts.push(
                env.DB.prepare(
                  'INSERT OR IGNORE INTO recipe_ingredients (recipe_id, ingredient) VALUES (?, ?)',
                ).bind(doc.id, name),
              );
            }
            const ingredientBatches = chunk(ingredientStmts, 100);
            for (const b of ingredientBatches) {
              await env.DB.batch(b);
            }
          }
        } catch (error) {
          console.warn('Ingredient extraction failed for recipe', doc.id, error);
        }

        msg.ack();
      } catch {
        msg.retry();
      }
    }
  },
};
