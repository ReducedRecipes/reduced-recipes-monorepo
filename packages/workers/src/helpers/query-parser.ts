/**
 * Parse natural-language exclusion terms from a search query.
 *
 * Recognised patterns:
 *   "pasta no gluten"          → exclusions: ["gluten"]
 *   "chicken without mushrooms"→ exclusions: ["mushrooms"]
 *   "soup not dairy"           → exclusions: ["dairy"]
 *   "cake but not nuts"        → exclusions: ["nuts"]
 *   "beef -onion"              → exclusions: ["onion"]
 */

export interface ParsedQuery {
  cleanQuery: string;
  exclusions: string[];
}

/**
 * Splits a raw phrase on "and" connectors to support
 * e.g. "without nuts and dairy" → ["nuts", "dairy"]
 */
function splitTerms(phrase: string): string[] {
  return phrase
    .split(/\s+and\s+/i)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

/** Extract exclusion keywords from a natural-language query. */
export function parseExclusions(q: string): ParsedQuery {
  const exclusions: string[] = [];

  const extract = (_match: string, term: string) => {
    splitTerms(term).forEach((t) => exclusions.push(t));
    return ' ';
  };

  // Order matters — "but not" must be replaced before "not"
  let cleaned = q;
  cleaned = cleaned.replace(/\bbut\s+not\s+([\w]+(?:\s+and\s+[\w]+)*)/gi, extract);
  cleaned = cleaned.replace(/\bwithout\s+([\w]+(?:\s+and\s+[\w]+)*)/gi, extract);
  cleaned = cleaned.replace(/\bnot\s+([\w]+(?:\s+and\s+[\w]+)*)/gi, extract);
  cleaned = cleaned.replace(/\bno\s+([\w]+(?:\s+and\s+[\w]+)*)/gi, extract);
  // Hyphen-prefixed terms: " -onion"
  cleaned = cleaned.replace(/(?:^|\s)-([\w]+)/g, (_match, term) => {
    exclusions.push(term.toLowerCase());
    return ' ';
  });

  return {
    cleanQuery: cleaned.replace(/\s+/g, ' ').trim(),
    exclusions: [...new Set(exclusions)],
  };
}
