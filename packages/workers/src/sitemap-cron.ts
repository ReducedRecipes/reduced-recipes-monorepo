/**
 * Daily sitemap generator cron worker.
 *
 * Runs once per day, queries all recipe IDs from D1, generates
 * a sitemap index + chunked sitemaps, and stores them in KV.
 * The API worker serves them directly from KV.
 */

interface SitemapEnv {
  DB: D1Database;
  CACHE_KV: KVNamespace;
}

const SITE_URL = 'https://reduced.recipes';
const CHUNK_SIZE = 10_000; // Max URLs per sitemap (Google limit: 50K)
const KV_TTL = 2 * 24 * 60 * 60; // 2 days (buffer beyond daily refresh)

export default {
  async scheduled(_event: ScheduledEvent, env: SitemapEnv, _ctx: ExecutionContext) {
    try {
      console.log('Sitemap cron: starting...');

      // Fetch all recipe IDs + extracted dates
      const { results } = await env.DB.prepare(
        'SELECT id, extracted_at FROM recipes ORDER BY extracted_at DESC',
      ).all();

      const recipes = (results ?? []) as Array<{ id: string; extracted_at: string }>;
      console.log(`Sitemap cron: ${recipes.length} recipes`);

      // Static pages
      const staticPages = [
        { loc: '/', priority: '1.0', changefreq: 'daily' },
        { loc: '/search', priority: '0.8', changefreq: 'daily' },
        { loc: '/ingredients', priority: '0.7', changefreq: 'weekly' },
        { loc: '/about', priority: '0.5', changefreq: 'monthly' },
        { loc: '/transparency', priority: '0.5', changefreq: 'weekly' },
      ];

      // Split recipes into chunks
      const chunks: Array<Array<{ id: string; extracted_at: string }>> = [];
      for (let i = 0; i < recipes.length; i += CHUNK_SIZE) {
        chunks.push(recipes.slice(i, i + CHUNK_SIZE));
      }

      // Generate each chunk sitemap
      for (let i = 0; i < chunks.length; i++) {
        const xml = buildSitemap(chunks[i]!);
        await env.CACHE_KV.put(`sitemap:chunk:${i}`, xml, { expirationTtl: KV_TTL });
      }

      // Generate static pages sitemap
      const staticXml = buildStaticSitemap(staticPages);
      await env.CACHE_KV.put('sitemap:static', staticXml, { expirationTtl: KV_TTL });

      // Generate sitemap index
      const now = new Date().toISOString().split('T')[0];
      const indexXml = buildSitemapIndex(chunks.length, now!);
      await env.CACHE_KV.put('sitemap:index', indexXml, { expirationTtl: KV_TTL });

      console.log(`Sitemap cron: done — ${chunks.length + 1} sitemaps, ${recipes.length} URLs`);
    } catch (err) {
      console.error('Sitemap cron FAILED:', err);
    }
  },
};

function buildSitemapIndex(recipeChunks: number, lastmod: string): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  xml += `  <sitemap>\n    <loc>${SITE_URL}/sitemap-static.xml</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>\n`;

  for (let i = 0; i < recipeChunks; i++) {
    xml += `  <sitemap>\n    <loc>${SITE_URL}/sitemap-${i}.xml</loc>\n    <lastmod>${lastmod}</lastmod>\n  </sitemap>\n`;
  }

  xml += '</sitemapindex>';
  return xml;
}

function buildStaticSitemap(pages: Array<{ loc: string; priority: string; changefreq: string }>): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const page of pages) {
    xml += `  <url>\n    <loc>${SITE_URL}${page.loc}</loc>\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>\n`;
  }

  xml += '</urlset>';
  return xml;
}

function buildSitemap(recipes: Array<{ id: string; extracted_at: string }>): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const r of recipes) {
    const lastmod = r.extracted_at ? r.extracted_at.split('T')[0] : '';
    xml += `  <url>\n    <loc>${SITE_URL}/recipe/${r.id}</loc>\n`;
    if (lastmod) xml += `    <lastmod>${lastmod}</lastmod>\n`;
    xml += `    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
  }

  xml += '</urlset>';
  return xml;
}
