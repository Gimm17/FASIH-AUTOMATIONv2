import type { CandidateReviewInput, AiCandidateReviewResult } from '@shared/messages';
import type { AiClient } from './ai-client';
import { detectFacilityType } from '@matching/facility-type';
import { extractProtectedTokens } from '@matching/protected-tokens';
import { calculateTextScores } from '@matching/score';
import type { SearchCandidate } from '@shared/types';
import type { TargetRow } from '@shared/types';

/**
 * Wrap AI adjudication with the inputs it's allowed to see + deterministic fallback.
 * AI is ONLY consulted for candidates that already passed hard guards (the verifier gates).
 * On any AI failure, returns { verdict: 'uncertain' } so the row goes to manual review.
 */
export async function adjudicateCandidate(
  target: Pick<TargetRow, 'data1'>,
  candidate: SearchCandidate,
  ai: AiClient | null,
): Promise<AiCandidateReviewResult> {
  if (!ai) {
    return { verdict: 'uncertain', confidence: 0, reason: 'AI unavailable — manual review' };
  }

  const localScores = calculateTextScores(target.data1, candidate.cardName);
  const input: CandidateReviewInput = {
    target: {
      name: target.data1,
      facilityType: detectFacilityType(target.data1),
      protectedTokens: extractProtectedTokens(target.data1),
    },
    candidate: {
      name: candidate.cardName,
      facilityType: detectFacilityType(candidate.cardName),
      protectedTokens: extractProtectedTokens(candidate.cardName),
    },
    localScores: {
      levenshtein: localScores.levenshtein,
      tokenOverlap: localScores.tokenOverlap,
      combined: localScores.combined,
    },
  };

  try {
    const verdict = await ai.adjudicate(input);
    return {
      verdict: verdict.verdict,
      confidence: verdict.confidence,
      reason: verdict.reason,
    };
  } catch {
    return { verdict: 'uncertain', confidence: 0, reason: 'AI error — manual review' };
  }
}
