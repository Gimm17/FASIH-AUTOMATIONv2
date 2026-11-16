import type { CandidateDecision } from '@shared/constants';
import type { CandidateEvaluation, MatchingSettings, SearchCandidate, TargetRow, AiVerdict } from '@shared/types';
import { normalizeName, normalizeIdentityCode, isSameIdentityCode } from './normalize';
import { detectFacilityType, isHardFacilityMismatch } from './facility-type';
import { protectedTokensCompatible, extractProtectedTokens } from './protected-tokens';
import { calculateTextScores, classifyScore } from './score';
import { onlyGenericMatch, hasCoreOverlap } from './token-overlap';

export interface VerifyOptions {
  settings: MatchingSettings;
  /** Optional AI verdict (only consulted in the AI_REVIEW band, AFTER hard guards pass). */
  aiVerdict?: AiVerdict;
  aiConfidence?: number;
}

/**
 * Deterministic candidate evaluation pipeline (IMPLEMENTATION_PLAN.md §19).
 *
 * Order (hard guards short-circuit):
 *   1. self-exclusion (exact code)          → REJECT_SELF
 *   2. facility type hard mismatch          → REJECT_FACILITY
 *   3. protected token mismatch             → REJECT_PROTECTED_TOKEN
 *   4. generic-only match                   → REJECT_SCORE
 *   5. combined >= autoAcceptThreshold      → ACCEPT
 *   6. combined >= aiReviewThreshold        → AI_REVIEW (consult AI; AI never overrides 1–4)
 *   7. else                                  → REJECT_SCORE
 *
 * AI can only promote an AI_REVIEW band candidate to ACCEPT when verdict=same_entity
 * and confidence >= aiAcceptConfidence AND all hard guards already passed.
 */
export function evaluateCandidate(
  target: Pick<TargetRow, 'data1' | 'codeIdentity'>,
  candidate: SearchCandidate,
  options: VerifyOptions,
): CandidateEvaluation {
  const reasons: string[] = [];
  const normalizedTarget = normalizeName(target.data1);
  const normalizedCandidate = normalizeName(candidate.cardName);

  // 1. Self-exclusion (HARD, exact identity code).
  if (isSameIdentityCode(target.codeIdentity, candidate.cardCode)) {
    reasons.push(`self-exclusion: code ${normalizeIdentityCode(candidate.cardCode)} == target code_identity`);
    return buildEvaluation(candidate, 'REJECT_SELF', normalizedTarget, normalizedCandidate, options, reasons, 0, 0, 0);
  }

  // 2. Facility type guard (HARD when both known & different).
  const targetType = detectFacilityType(target.data1);
  const candidateType = detectFacilityType(candidate.cardName);
  const facilityMatch = targetType === candidateType;
  if (isHardFacilityMismatch(targetType, candidateType)) {
    reasons.push(`facility mismatch: ${targetType} vs ${candidateType}`);
    return buildEvaluation(candidate, 'REJECT_FACILITY', normalizedTarget, normalizedCandidate, options, reasons, 0, 0, 0, targetType, candidateType, facilityMatch);
  }

  // 3. Protected token guard (HARD — directions/numbers/romans must be set-equal).
  const protectedTokenMatch = protectedTokensCompatible(target.data1, candidate.cardName);
  if (!protectedTokenMatch) {
    const tTok = extractProtectedTokens(target.data1);
    const cTok = extractProtectedTokens(candidate.cardName);
    reasons.push(`protected-token mismatch: target={${tTok.join(',')}} candidate={${cTok.join(',')}}`);
    return buildEvaluation(candidate, 'REJECT_PROTECTED_TOKEN', normalizedTarget, normalizedCandidate, options, reasons, 0, 0, 0, targetType, candidateType, facilityMatch);
  }

  // 4. Generic-only match — reject (core discriminative token required).
  const genericOnly = onlyGenericMatch(target.data1, candidate.cardName);
  if (genericOnly) {
    reasons.push('only generic tokens shared — no core discriminative token');
    return buildEvaluation(candidate, 'REJECT_SCORE', normalizedTarget, normalizedCandidate, options, reasons, 0, 0, 0, targetType, candidateType, facilityMatch);
  }

  // 5–7. Score-based decision.
  const scores = calculateTextScores(target.data1, candidate.cardName);
  const band = classifyScore(scores.combined, options.settings);

  if (band === 'ACCEPT') {
    reasons.push(`combined score ${scores.combined} >= auto-accept threshold`);
    return buildEvaluation(candidate, 'ACCEPT', normalizedTarget, normalizedCandidate, options, reasons, scores.levenshtein, scores.tokenOverlap, scores.combined, targetType, candidateType, facilityMatch, protectedTokenMatch);
  }

  if (band === 'AI_REVIEW') {
    // Consult AI (if provided). AI never overrides 1–4 — they already passed.
    if (options.aiVerdict === 'same_entity' && (options.aiConfidence ?? 0) >= options.settings.aiAcceptConfidence) {
      reasons.push(`AI verdict same_entity confidence ${options.aiConfidence} >= ${options.settings.aiAcceptConfidence}`);
      return buildEvaluation(candidate, 'ACCEPT', normalizedTarget, normalizedCandidate, options, reasons, scores.levenshtein, scores.tokenOverlap, scores.combined, targetType, candidateType, facilityMatch, protectedTokenMatch);
    }
    if (options.aiVerdict === 'different_entity' && (options.aiConfidence ?? 0) >= options.settings.aiAcceptConfidence) {
      reasons.push(`AI verdict different_entity confidence ${options.aiConfidence}`);
      return buildEvaluation(candidate, 'REJECT_SCORE', normalizedTarget, normalizedCandidate, options, reasons, scores.levenshtein, scores.tokenOverlap, scores.combined, targetType, candidateType, facilityMatch, protectedTokenMatch);
    }
    reasons.push(`ambiguous band ${scores.combined}; AI verdict=${options.aiVerdict ?? 'none'}`);
    return buildEvaluation(candidate, 'AI_REVIEW', normalizedTarget, normalizedCandidate, options, reasons, scores.levenshtein, scores.tokenOverlap, scores.combined, targetType, candidateType, facilityMatch, protectedTokenMatch);
  }

  // REJECT band.
  reasons.push(`combined score ${scores.combined} below ai-review threshold`);
  return buildEvaluation(candidate, 'REJECT_SCORE', normalizedTarget, normalizedCandidate, options, reasons, scores.levenshtein, scores.tokenOverlap, scores.combined, targetType, candidateType, facilityMatch, protectedTokenMatch);
}

function buildEvaluation(
  candidate: SearchCandidate,
  decision: CandidateDecision,
  normalizedTarget: string,
  normalizedCandidate: string,
  options: VerifyOptions,
  reasons: string[],
  levenshteinScore: number,
  tokenOverlapScore: number,
  combinedScore: number,
  targetType?: ReturnType<typeof detectFacilityType>,
  candidateType?: ReturnType<typeof detectFacilityType>,
  facilityMatch?: boolean | null,
  protectedTokenMatch = false,
): CandidateEvaluation {
  return {
    candidate,
    decision,
    normalizedTarget,
    normalizedCandidate,
    levenshteinScore,
    tokenOverlapScore,
    combinedScore,
    facilityMatch: facilityMatch ?? (targetType && candidateType ? targetType === candidateType : null),
    protectedTokenMatch,
    ...(options.aiVerdict ? { aiVerdict: options.aiVerdict } : {}),
    ...(options.aiConfidence !== undefined ? { aiConfidence: options.aiConfidence } : {}),
    reasons,
  };
}

/** Convenience: ACCEPT evaluations only (for the candidate pool final filter). */
export function getAcceptedCandidates(evaluations: CandidateEvaluation[]): CandidateEvaluation[] {
  return evaluations.filter((e) => e.decision === 'ACCEPT');
}

/** True when any evaluation is in the AI_REVIEW band (manual review candidate). */
export function hasAmbiguousCandidates(evaluations: CandidateEvaluation[]): boolean {
  return evaluations.some((e) => e.decision === 'AI_REVIEW' || e.decision === 'MANUAL_REVIEW');
}

/** Whether the target needs additional/alternate search (no accepts yet, not terminal). */
export function needsMoreSearch(evaluations: CandidateEvaluation[]): boolean {
  return getAcceptedCandidates(evaluations).length === 0 && hasAmbiguousCandidates(evaluations);
}

/** Safety net: candidate must share a distinctive core token with the target. */
export function hasDistinctiveCoreOverlap(target: string, candidateText: string): boolean {
  return hasCoreOverlap(target, candidateText);
}
