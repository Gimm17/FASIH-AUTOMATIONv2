import { normalizeName } from './normalize';

/**
 * Levenshtein edit distance + similarity ratio (IMPLEMENTATION_PLAN.md §18.3).
 * similarity = 1 - dist / max(len(a), len(b)), range 0..1.
 * No external fuzzy-matching dependency — auditable, single file.
 */

export function levenshteinDistance(aRaw: string, bRaw: string): number {
  const a = String(aRaw ?? '');
  const b = String(bRaw ?? '');
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Two rolling rows (O(min(m,n)) space).
  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length];
}

export function levenshteinSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1.0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(na, nb);
  return Math.max(0, 1 - dist / maxLen);
}

/**
 * Token-level fuzzy equivalence: two single tokens are "near-equal" when their
 * similarity ≥ threshold. Used so a typo'd token still counts toward overlap.
 */
export function tokensNearEqual(a: string, b: string, threshold = 0.8): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  // For short tokens (≤3 chars) require exact match to avoid spurious near-matches
  // (e.g. "TK" vs "TR").
  if (a.length <= 3 || b.length <= 3) return a === b;
  return levenshteinSimilarity(a, b) >= threshold;
}
