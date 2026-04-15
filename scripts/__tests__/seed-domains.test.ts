import { describe, it, expect } from 'vitest';

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

describe('seed-domains', () => {
  describe('domain data', () => {
    it('should have exactly 15 seed domains', () => {
      expect(SEED_DOMAINS).toHaveLength(15);
    });

    it('should have all unique domains', () => {
      const uniqueDomains = new Set(SEED_DOMAINS.map((d) => d.domain));
      expect(uniqueDomains.size).toBe(15);
    });

    it('should have all sitemap_urls ending with /sitemap.xml', () => {
      for (const d of SEED_DOMAINS) {
        expect(d.sitemap_url).toMatch(/\/sitemap\.xml$/);
      }
    });

    it('should have all sitemap_urls using HTTPS', () => {
      for (const d of SEED_DOMAINS) {
        expect(d.sitemap_url).toMatch(/^https:\/\//);
      }
    });

    it('should have all crawl_delay_ms set to 2000', () => {
      for (const d of SEED_DOMAINS) {
        expect(d.crawl_delay_ms).toBe(2000);
      }
    });

    it('should contain all required domains', () => {
      const domains = new Set(SEED_DOMAINS.map((d) => d.domain));
      const required = [
        "seriouseats.com", "allrecipes.com", "budgetbytes.com",
        "minimalistbaker.com", "smittenkitchen.com", "cookieandkate.com",
        "food52.com", "bonappetit.com", "epicurious.com", "simplyrecipes.com",
        "loveandlemons.com", "pinchofyum.com", "halfbakedharvest.com",
        "damndelicious.com", "thepioneerwoman.com",
      ];
      for (const rd of required) {
        expect(domains.has(rd)).toBe(true);
      }
    });
  });

  describe('buildInsertSQL', () => {
    const sql = buildInsertSQL(SEED_DOMAINS);

    it('should use INSERT OR IGNORE for idempotency', () => {
      expect(sql).toContain('INSERT OR IGNORE');
    });

    it('should reference correct table and columns', () => {
      expect(sql).toContain('INTO domains (domain, sitemap_url, crawl_delay_ms, active, recipe_count)');
    });

    it('should contain all 15 domains in the SQL', () => {
      for (const d of SEED_DOMAINS) {
        expect(sql).toContain(`'${d.domain}'`);
      }
    });
  });
});
