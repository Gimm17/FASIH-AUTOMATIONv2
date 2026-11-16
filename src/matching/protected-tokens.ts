import { normalizeName, tokenize } from './normalize';

/**
 * Protected tokens carry high discriminative weight and must not be dropped by normalization.
 * Direction words, standalone numbers, and roman numerals (IMPLEMENTATION_PLAN.md §17).
 *
 * Hard-mismatch example: "SMAN 1 TINANGKUNG" vs "SMAN 1 TINANGKUNG UTARA" → the candidate
 * carries a direction token the target does not → REJECT_PROTECTED_TOKEN.
 */

export const DIRECTION_TOKENS = new Set<string>([
  'UTARA',
  'SELATAN',
  'TIMUR',
  'BARAT',
  'TENGAH',
  'HULU',
  'HILIR',
  'INDUK',
  'PUSAT',
]);

export const ROMAN_NUMERALS = new Set<string>(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

/** All protected tokens found in a normalized name: directions, standalone numbers, romans. */
export function extractProtectedTokens(name: string | null | undefined): string[] {
  const norm = normalizeName(name);
  if (!norm) return [];
  const tokens = tokenize(norm);
  const out = new Set<string>();

  for (const t of tokens) {
    if (DIRECTION_TOKENS.has(t)) {
      out.add(t);
      continue;
    }
    // Standalone digits (numbers are protected — "1" vs "2" means different schools).
    if (/^\d+$/.test(t)) {
      out.add(t);
      continue;
    }
    if (ROMAN_NUMERALS.has(t)) {
      out.add(t);
      continue;
    }
    // Token like "1." or "1," → bare number
    const bareNum = t.replace(/[.,]/g, '');
    if (/^\d+$/.test(bareNum)) {
      out.add(bareNum);
    }
  }

  return Array.from(out).sort();
}

/**
 * Protected tokens are compatible when the candidate's protected-token set is a SUBSET
 * of the target's set (IMPLEMENTATION_PLAN.md §17):
 *
 *   - A token in the candidate that the target does NOT have is a conflict → reject.
 *     ("SMAN 1 TINANGKUNG" vs "SMAN 1 TINANGKUNG UTARA" → UTARA extra in candidate → reject;
 *      "SMAN 1 X" vs "SMAN 2 X" → 2 not in target → reject.)
 *   - A token MISSING from the candidate (target has it, candidate doesn't) is allowed —
 *     FASIH names are frequently less specific than the Excel name.
 *     ("SMAN 1 TINANGKUNG" vs "SMAN TINANGKUNG" → compatible.)
 */
export function protectedTokensCompatible(target: string, candidate: string): boolean {
  const t = new Set(extractProtectedTokens(target));
  const c = new Set(extractProtectedTokens(candidate));
  // Every protected token the candidate claims must also exist in the target.
  for (const tok of c) if (!t.has(tok)) return false;
  return true;
}

/** Just the direction subset (for diagnostics / region guard reasoning). */
export function extractDirectionTokens(name: string | null | undefined): string[] {
  return extractProtectedTokens(name).filter((t) => DIRECTION_TOKENS.has(t));
}
