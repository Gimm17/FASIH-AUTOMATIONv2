import { describe, expect, it } from 'vitest';
import { calculateTextScores, classifyScore, SCORE_WEIGHTS } from './score';
import type { MatchingSettings } from '@shared/types';

const settings: MatchingSettings = {
  autoAcceptThreshold: 0.92,
  aiReviewThreshold: 0.72,
  aiAcceptConfidence: 0.85,
};

describe('calculateTextScores', () => {
  it('perfect scores for identical names', () => {
    const s = calculateTextScores('Polindes Labangun', 'POLINDES LABANGUN');
    expect(s.levenshtein).toBe(1);
    expect(s.tokenOverlap).toBe(1);
    expect(s.combined).toBe(1);
    expect(s.onlyGenericMatch).toBe(false);
  });

  it('combines with the configured weights (0.55 overlap + 0.45 lev)', () => {
    expect(SCORE_WEIGHTS.tokenOverlap).toBe(0.55);
    expect(SCORE_WEIGHTS.levenshtein).toBe(0.45);
    const s = calculateTextScores('POLINDES LABANGUN', 'POLINDES LABANGUNG');
    expect(s.combined).toBeCloseTo(0.55 * s.tokenOverlap + 0.45 * s.levenshtein, 6);
  });

  it('flags generic-only matches', () => {
    const s = calculateTextScores('PUSKESMAS TINANGKUNG', 'PUSKESMAS LOLANTANG');
    expect(s.onlyGenericMatch).toBe(true);
  });
});

describe('classifyScore', () => {
  it('bands per thresholds', () => {
    expect(classifyScore(0.95, settings)).toBe('ACCEPT');
    expect(classifyScore(0.8, settings)).toBe('AI_REVIEW');
    expect(classifyScore(0.5, settings)).toBe('REJECT');
  });

  it('boundary values land in the higher band', () => {
    expect(classifyScore(0.92, settings)).toBe('ACCEPT');
    expect(classifyScore(0.72, settings)).toBe('AI_REVIEW');
  });
});
