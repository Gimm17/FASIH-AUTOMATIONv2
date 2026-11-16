import type { MatchingSettings } from '@shared/types';
import { levenshteinSimilarity } from './levenshtein';
import { tokenOverlap, onlyGenericMatch } from './token-overlap';
import { normalizeName } from './normalize';

export interface TextScores {
  levenshtein: number;
  tokenOverlap: number;
  combined: number;
  /** True when target & candidate share ONLY generic tokens (no core overlap). */
  onlyGenericMatch: boolean;
}

/**
 * Combined deterministic text score (IMPLEMENTATION_PLAN.md §18.5).
 *   combined = 0.55 * tokenOverlap + 0.45 * levenshtein
 * Tuneable; defaults are a STARTING POINT for calibration.
 */
export const SCORE_WEIGHTS = { tokenOverlap: 0.55, levenshtein: 0.45 } as const;

export function calculateTextScores(target: string, candidate: string): TextScores {
  const nt = normalizeName(target);
  const nc = normalizeName(candidate);

  const lev = levenshteinSimilarity(nt, nc);
  const overlap = tokenOverlap(nt, nc).score;
  const combined = SCORE_WEIGHTS.tokenOverlap * overlap + SCORE_WEIGHTS.levenshtein * lev;
  const onlyGeneric = onlyGenericMatch(nt, nc);

  return {
    levenshtein: round(lev),
    tokenOverlap: round(overlap),
    combined: round(combined),
    onlyGenericMatch: onlyGeneric,
  };
}

/** Threshold band classification per the plan's suggested bands. */
export type ScoreBand = 'ACCEPT' | 'AI_REVIEW' | 'REJECT';

export function classifyScore(combined: number, settings: MatchingSettings): ScoreBand {
  if (combined >= settings.autoAcceptThreshold) return 'ACCEPT';
  if (combined >= settings.aiReviewThreshold) return 'AI_REVIEW';
  return 'REJECT';
}

function round(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
