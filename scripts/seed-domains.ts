/**
 * Seed the D1 domains table with the initial 15 recipe domains.
 *
 * Usage: pnpm seed
 *   (or: pnpm tsx scripts/seed-domains.ts)
 *
 * Idempotent — uses INSERT OR IGNORE so re-running is safe.
 */

import { execSync } from "node:child_process";

interface SeedDomain {
  domain: string;
  sitemap_url: string;
  crawl_delay_ms: number;
}

const SEED_DOMAINS: SeedDomain[] = [
  { domain: "seriouseats.com",      sitemap_url: "https://www.seriouseats.com/sitemap.xml",      crawl_delay_ms: 2000 },
  { domain: "allrecipes.com",       sitemap_url: "https://www.allrecipes.com/sitemap.xml",       crawl_delay_ms: 2000 },
  { domain: "budgetbytes.com",      sitemap_url: "https://www.budgetbytes.com/sitemap.xml",      crawl_delay_ms: 2000 },
  { domain: "minimalistbaker.com",  sitemap_url: "https://minimalistbaker.com/sitemap.xml",      crawl_delay_ms: 2000 },
  { domain: "smittenkitchen.com",   sitemap_url: "https://smittenkitchen.com/sitemap.xml",       crawl_delay_ms: 2000 },
  { domain: "cookieandkate.com",    sitemap_url: "https://cookieandkate.com/sitemap.xml",        crawl_delay_ms: 2000 },
  { domain: "food52.com",           sitemap_url: "https://food52.com/sitemap.xml",               crawl_delay_ms: 2000 },
  { domain: "bonappetit.com",       sitemap_url: "https://www.bonappetit.com/sitemap.xml",       crawl_delay_ms: 2000 },
  { domain: "epicurious.com",       sitemap_url: "https://www.epicurious.com/sitemap.xml",       crawl_delay_ms: 2000 },
  { domain: "simplyrecipes.com",    sitemap_url: "https://www.simplyrecipes.com/sitemap.xml",    crawl_delay_ms: 2000 },
  { domain: "loveandlemons.com",    sitemap_url: "https://www.loveandlemons.com/sitemap.xml",    crawl_delay_ms: 2000 },
  { domain: "pinchofyum.com",       sitemap_url: "https://pinchofyum.com/sitemap.xml",           crawl_delay_ms: 2000 },
  { domain: "halfbakedharvest.com", sitemap_url: "https://www.halfbakedharvest.com/sitemap.xml", crawl_delay_ms: 2000 },
  { domain: "damndelicious.com",    sitemap_url: "https://damndelicious.net/sitemap.xml",        crawl_delay_ms: 2000 },
  { domain: "thepioneerwoman.com",  sitemap_url: "https://www.thepioneerwoman.com/sitemap.xml",  crawl_delay_ms: 2000 },
];

function buildInsertSQL(domains: SeedDomain[]): string {
  const rows = domains
    .map(
      (d) =>
        `('${d.domain}', '${d.sitemap_url}', ${d.crawl_delay_ms}, 1, 0)`
    )
    .join(",\n  ");

  return `INSERT OR IGNORE INTO domains (domain, sitemap_url, crawl_delay_ms, active, recipe_count) VALUES\n  ${rows};`;
}

function main(): void {
  const sql = buildInsertSQL(SEED_DOMAINS);

  console.log(`Seeding ${SEED_DOMAINS.length} domains into D1...\n`);
  console.log(sql);
  console.log();

  try {
    const result = execSync(
      `npx wrangler d1 execute reduced-recipes-prod --command="${sql.replace(/"/g, '\\"')}"`,
      { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }
    );
    console.log(result);
    console.log(`Successfully seeded ${SEED_DOMAINS.length} domains.`);
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    console.error("Failed to seed domains:");
    console.error(err.stderr ?? err.message);
    process.exit(1);
  }
}

main();
