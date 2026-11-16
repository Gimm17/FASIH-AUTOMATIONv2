/**
 * Text normalization for entity-name comparison (IMPLEMENTATION_PLAN.md §14).
 *
 * Comparison normalization MUST NOT mutate the original Excel data1 — it is only used
 * to compute scores and guards. `normalizeIdentityCode` is the canonical form used for
 * self-exclusion (exact, never fuzzy).
 */

/**
 * Basic pipeline for *entity names*:
 *   1. uppercase
 *   2. Unicode NFKD + remove combining marks
 *   3. trim
 *   4. punctuation/separator chars → single space
 *   5. collapse whitespace
 *   6. preserve numbers, direction tokens, roman numerals
 *   7. alias-expand common abbreviations for comparison only (SDN→SD NEGERI)
 */
export function normalizeName(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);
  // 1. uppercase
  s = s.toUpperCase();
  // 2. Unicode normalize + strip combining marks (diacritics) — e.g. é → e
  s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
  // 3. (trim happens after punctuation normalization)
  // 4. punctuation/separator → space. Keep hyphens for compound names but collapse
  //    " - " patterns; hyphen is significant inside compound tokens (PONDING-PONDING).
  s = s.replace(/[_,\.'"();:/\\]/g, ' ');
  // Normalize em/en dashes and hyphen-space-hyphen artifacts to a single hyphen.
  s = s.replace(/\s*[‐-―−]\s*/g, '-');
  // 5. collapse whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // 7. alias expansion for comparison (does NOT change Excel data1).
  s = applyAliasExpansion(s);
  return s;
}

/**
 * Canonical identity-code form used for self-exclusion.
 * Strips region prefixes like "7201 - " or "7201042004000100 – " so that a candidate
 * code "SE26mpvzxsBE0A" matches a target code "7201 - SE26mpvzxsBE0A".
 *
 * Identity codes are NEVER fuzzy matched — only exact after this canonical form.
 */
export function normalizeIdentityCode(code: string | null | undefined): string {
  if (!code) return '';
  let s = String(code).trim().toUpperCase();
  // Strip leading region/building prefix: "7201 - ", "7201042004000100 – "
  s = s.replace(/^\d{4,}\s*[-–—]\s*/g, '');
  // Collapse any internal whitespace
  s = s.replace(/\s+/g, ' ').trim();
  // Normalize hyphen spacing: "SE26 - X" → "SE26-X"
  s = s.replace(/\s*-\s*/g, '-');
  return s;
}

/** True when two identity codes are canonically equal (used for self-exclusion). */
export function isSameIdentityCode(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeIdentityCode(a);
  const nb = normalizeIdentityCode(b);
  return na.length > 0 && na === nb;
}

const ALIAS_MAP: Array<[RegExp, string]> = [
  [/\bSDN\b/g, 'SD NEGERI'],
  [/\bSMPN\b/g, 'SMP NEGERI'],
  [/\bSMAN\b/g, 'SMA NEGERI'],
  [/\bSMKN\b/g, 'SMK NEGERI'],
  [/\bMTSN\b/g, 'MTS NEGERI'],
  [/\bMAN\b/g, 'MA NEGERI'],
  // NOTE: "MI" (Madrasah Ibtidaiyah) is intentionally NOT expanded — it is mostly
  // private, so "MI NEGERI" would be wrong; MI compares as-is in both names.
];

/** Expand well-known abbreviations so SDN and SD NEGERI compare equal. Not aggressive. */
export function applyAliasExpansion(s: string): string {
  let out = s;
  for (const [re, repl] of ALIAS_MAP) {
    out = out.replace(re, repl);
  }
  return out;
}

/** Tokenize a normalized name into space-separated words (≥1 char). */
export function tokenize(normalized: string): string[] {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((t) => t.length > 0);
}

/**
 * Normalize a *search query*. Lighter than normalizeName: preserves hyphen compounds,
 * collapses whitespace, uppercases. Used to build dedup keys for candidate queries.
 */
export function normalizeQuery(query: string | null | undefined): string {
  if (!query) return '';
  let s = String(query).trim().toUpperCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/[_,\.'"();:/\\]/g, ' ').replace(/\s+/g, ' ').trim();
  return s;
}
