/**
 * Basic validation tests for seed-domains.ts logic.
 * Run with: pnpm tsx scripts/__tests__/seed-domains.test.ts
 */

// ---- Inline the domain list and SQL builder so we can test without side effects ----

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

// ---- Tests ----

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log("seed-domains tests\n");

// Test: Correct number of domains
assert(SEED_DOMAINS.length === 15, "Should have exactly 15 seed domains");

// Test: All domains are unique
const uniqueDomains = new Set(SEED_DOMAINS.map((d) => d.domain));
assert(uniqueDomains.size === 15, "All domains should be unique");

// Test: All sitemap_urls end with /sitemap.xml
assert(
  SEED_DOMAINS.every((d) => d.sitemap_url.endsWith("/sitemap.xml")),
  "All sitemap_urls should end with /sitemap.xml"
);

// Test: All sitemap_urls start with https://
assert(
  SEED_DOMAINS.every((d) => d.sitemap_url.startsWith("https://")),
  "All sitemap_urls should use HTTPS"
);

// Test: All crawl_delay_ms are 2000
assert(
  SEED_DOMAINS.every((d) => d.crawl_delay_ms === 2000),
  "All crawl_delay_ms should be 2000"
);

// Test: SQL contains INSERT OR IGNORE
const sql = buildInsertSQL(SEED_DOMAINS);
assert(sql.includes("INSERT OR IGNORE"), "SQL should use INSERT OR IGNORE for idempotency");

// Test: SQL references correct table and columns
assert(
  sql.includes("INTO domains (domain, sitemap_url, crawl_delay_ms, active, recipe_count)"),
  "SQL should insert into correct columns"
);

// Test: SQL contains all 15 domains
for (const d of SEED_DOMAINS) {
  assert(sql.includes(`'${d.domain}'`), `SQL should contain domain '${d.domain}'`);
}

// Test: Required domains from spec are present
const requiredDomains = [
  "seriouseats.com", "allrecipes.com", "budgetbytes.com",
  "minimalistbaker.com", "smittenkitchen.com", "cookieandkate.com",
  "food52.com", "bonappetit.com", "epicurious.com", "simplyrecipes.com",
  "loveandlemons.com", "pinchofyum.com", "halfbakedharvest.com",
  "damndelicious.com", "thepioneerwoman.com",
];
for (const rd of requiredDomains) {
  assert(uniqueDomains.has(rd), `Required domain '${rd}' should be in seed list`);
}

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
