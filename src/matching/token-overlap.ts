import { normalizeName, tokenize } from './normalize';
import { levenshteinDistance } from './levenshtein';
import { tokensNearEqual } from './levenshtein';

/**
 * Generic tokens do NOT prove a match (IMPLEMENTATION_PLAN.md §18.1).
 * Core tokens = all tokens − generic tokens. Two names matching ONLY on generic
 * tokens must be rejected.
 */
export const GENERIC_TOKENS = new Set<string>([
  'NEGERI',
  'SWASTA',
  'DESA',
  'KELURAHAN',
  'KECAMATAN',
  'KABUPATEN',
  'SEKOLAH',
  'TK',
  'PAUD',
  'KB',
  'SD',
  'SDN',
  'SD NEGERI',
  'SMP',
  'SMPN',
  'SMP NEGERI',
  'SMA',
  'SMAN',
  'SMA NEGERI',
  'SMK',
  'SMKN',
  'PUSKESMAS',
  'PUSTU',
  'POLINDES',
  'POSKESDES',
  'POSYANDU',
  'PASAR',
  'UNIT',
  'UPT',
  'KANTOR',
  'BALAI',
  'SUB',
  'DUSUN',
  'RT',
  'RW',
  'LINGKUNGAN',
  'TERPADU',
  'PEMBINA',
  'MADRASAH',
  'MTS',
  'MA',
  'MI',
]);

export function isGenericToken(token: string): boolean {
  return GENERIC_TOKENS.has(token.toUpperCase());
}

/** Tokens that are not generic — the *discriminative* part of a name. */
export function coreTokens(name: string | null | undefined): string[] {
  const tokens = tokenize(normalizeName(name));
  return tokens.filter((t) => !isGenericToken(t));
}

/** All tokens (including generic), for diagnostics. */
export function allTokens(name: string | null | undefined): string[] {
  return tokenize(normalizeName(name));
}

/**
 * Core-token Jaccard overlap, with token-level fuzzy equivalence so a typo'd core
 * token (PONIDNG vs PONDING) still counts.
 *
 *   intersection(coreTarget, coreCandidate)
 *   ----------------------------------------
 *   union(coreTarget, coreCandidate)
 */
export function tokenOverlap(target: string, candidate: string): { score: number; intersection: string[]; union: string[] } {
  const t = coreTokens(target);
  const c = coreTokens(candidate);

  if (t.length === 0 && c.length === 0) {
    // Both names are entirely generic — overlap is undefined; callers should reject.
    return { score: 0, intersection: [], union: [] };
  }
  if (t.length === 0 || c.length === 0) {
    return { score: 0, intersection: [], union: t.length ? t : c };
  }

  const intersection: string[] = [];
  const usedC = new Set<number>();
  for (const tt of t) {
    for (let i = 0; i < c.length; i++) {
      if (usedC.has(i)) continue;
      if (tokensNearEqual(tt, c[i])) {
        intersection.push(tt);
        usedC.add(i);
        break;
      }
    }
  }

  // union = all of t + all of c not matched
  const union: string[] = [...t];
  for (let i = 0; i < c.length; i++) {
    if (!usedC.has(i)) union.push(c[i]);
  }

  const score = union.length === 0 ? 0 : intersection.length / union.length;
  return { score, intersection, union };
}

/** True when target and candidate share at least one distinctive (core) token. */
export function hasCoreOverlap(target: string, candidate: string): boolean {
  const t = coreTokens(target);
  if (t.length === 0) return true; // nothing distinctive to require
  const c = coreTokens(candidate);
  for (const tt of t) {
    for (const cc of c) {
      if (tokensNearEqual(tt, cc)) return true;
    }
  }
  return false;
}

/** True when the ONLY shared tokens are generic (no core-token overlap). */
export function onlyGenericMatch(target: string, candidate: string): boolean {
  return !hasCoreOverlap(target, candidate);
}

// re-export for tests that import from this module
export { levenshteinDistance };
