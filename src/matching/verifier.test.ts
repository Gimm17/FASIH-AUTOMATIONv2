import { describe, expect, it } from 'vitest';
import { evaluateCandidate, getAcceptedCandidates, hasAmbiguousCandidates, needsMoreSearch } from './verifier';
import type { SearchCandidate, MatchingSettings, TargetRow } from '@shared/types';

const settings: MatchingSettings = {
  autoAcceptThreshold: 0.92,
  aiReviewThreshold: 0.72,
  aiAcceptConfidence: 0.85,
};

const target: TargetRow = {
  rowNumber: 5,
  data1: 'Polindes Labangun',
  codeIdentity: '7201 - SE26mpewbw33D8',
};

function candidate(name: string, code: string): SearchCandidate {
  return { sourceQuery: name, cardName: name, cardCode: code, rawText: `${code} - ${name}`, metadata: {} };
}

describe('evaluateCandidate — hard guards short-circuit', () => {
  it('1. REJECT_SELF: candidate code equals the target code_identity (prefix-aware)', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Labangun', 'SE26mpewbw33D8'), { settings });
    expect(evaluation.decision).toBe('REJECT_SELF');
  });

  it('2. REJECT_FACILITY: known-but-different facility types', () => {
    const evaluation = evaluateCandidate(target, candidate('Poskesdes Labangun', 'SE26aaaaaaaaaa1'), { settings });
    expect(evaluation.decision).toBe('REJECT_FACILITY');
  });

  it('3. REJECT_PROTECTED_TOKEN: candidate carries an extra direction', () => {
    const t: TargetRow = { ...target, data1: 'SMAN 1 TINANGKUNG' };
    const evaluation = evaluateCandidate(t, candidate('SMAN 1 TINANGKUNG UTARA', 'SE26bbbbbbbbbb2'), { settings });
    expect(evaluation.decision).toBe('REJECT_PROTECTED_TOKEN');
  });

  it('4. REJECT_SCORE: only generic tokens shared', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Bangpanga', 'SE26cccccccccc3'), { settings });
    expect(evaluation.decision).toBe('REJECT_SCORE');
    expect(evaluation.reasons[0]).toContain('generic');
  });

  it('AI can NEVER override a hard guard (facility mismatch stays rejected)', () => {
    const evaluation = evaluateCandidate(target, candidate('Poskesdes Labangun', 'SE26aaaaaaaaaa1'), {
      settings,
      aiVerdict: 'same_entity',
      aiConfidence: 0.99,
    });
    expect(evaluation.decision).toBe('REJECT_FACILITY');
  });
});

describe('evaluateCandidate — score bands', () => {
  const wideBands: MatchingSettings = { autoAcceptThreshold: 0.99, aiReviewThreshold: 0.5, aiAcceptConfidence: 0.85 };

  it('exact name (different code) is ACCEPT', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Labangun', 'SE26dddddddddd4'), { settings });
    expect(evaluation.decision).toBe('ACCEPT');
  });

  it('near-typos land in AI_REVIEW without a verdict', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Labangung', 'SE26dddddddddd4'), { settings: wideBands });
    expect(evaluation.decision).toBe('AI_REVIEW');
  });

  it('AI same_entity with enough confidence promotes to ACCEPT', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Labangung', 'SE26dddddddddd4'), {
      settings: wideBands,
      aiVerdict: 'same_entity',
      aiConfidence: 0.9,
    });
    expect(evaluation.decision).toBe('ACCEPT');
  });

  it('AI same_entity with LOW confidence stays in AI_REVIEW (manual)', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Labangung', 'SE26dddddddddd4'), {
      settings: wideBands,
      aiVerdict: 'same_entity',
      aiConfidence: 0.6,
    });
    expect(evaluation.decision).toBe('AI_REVIEW');
  });

  it('AI different_entity rejects', () => {
    const evaluation = evaluateCandidate(target, candidate('Polindes Labangung', 'SE26dddddddddd4'), {
      settings: wideBands,
      aiVerdict: 'different_entity',
      aiConfidence: 0.9,
    });
    expect(evaluation.decision).toBe('REJECT_SCORE');
  });
});

describe('aggregation helpers', () => {
  const accepted = evaluateCandidate(target, candidate('Polindes Labangun', 'SE26dddddddddd4'), { settings });
  const ambiguous = evaluateCandidate(target, candidate('Polindes Labangung', 'SE26dddddddddd5'), {
    settings: { autoAcceptThreshold: 0.99, aiReviewThreshold: 0.5, aiAcceptConfidence: 0.85 },
  });
  it('getAcceptedCandidates filters to ACCEPT', () => {
    expect(getAcceptedCandidates([accepted, ambiguous])).toEqual([accepted]);
  });

  it('hasAmbiguousCandidates detects the review band', () => {
    expect(hasAmbiguousCandidates([accepted])).toBe(false);
    expect(hasAmbiguousCandidates([accepted, ambiguous])).toBe(true);
  });

  it('needsMoreSearch: no accepts AND ambiguity present', () => {
    expect(needsMoreSearch([ambiguous])).toBe(true);
    expect(needsMoreSearch([accepted, ambiguous])).toBe(false);
  });
});
