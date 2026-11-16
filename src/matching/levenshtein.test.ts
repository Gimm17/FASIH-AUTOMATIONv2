import { describe, expect, it } from 'vitest';
import { levenshteinDistance, levenshteinSimilarity, tokensNearEqual } from './levenshtein';

describe('levenshteinDistance', () => {
  it('computes classic examples', () => {
    expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(levenshteinDistance('flaw', 'lawn')).toBe(2);
    expect(levenshteinDistance('', 'abc')).toBe(3);
    expect(levenshteinDistance('abc', 'abc')).toBe(0);
  });

  it('is symmetric', () => {
    expect(levenshteinDistance('ponding', 'ponidng')).toBe(levenshteinDistance('ponidng', 'ponding'));
  });
});

describe('levenshteinSimilarity', () => {
  it('is 1 for identical normalized names', () => {
    expect(levenshteinSimilarity('Polindes Labangun', 'POLINDES LABANGUN')).toBe(1);
  });

  it('shrinks with edit distance', () => {
    const sim = levenshteinSimilarity('PONDING', 'PONIDNG');
    expect(sim).toBeGreaterThan(0.7);
    expect(sim).toBeLessThan(1);
  });

  it('is case-insensitive via normalization', () => {
    expect(levenshteinSimilarity('labangun', 'LABANGUN')).toBe(1);
  });
});

describe('tokensNearEqual', () => {
  it('exact match always passes', () => {
    expect(tokensNearEqual('TK', 'TK')).toBe(true);
  });

  it('short tokens require exact match (TK vs TR is not near-equal)', () => {
    expect(tokensNearEqual('TK', 'TR')).toBe(false);
    expect(tokensNearEqual('SD', 'SD1')).toBe(false);
  });

  it('long tokens allow typo tolerance at the default 0.8 threshold', () => {
    expect(tokensNearEqual('LABANGUN', 'LABANGUNG')).toBe(true); // sim 0.875
    expect(tokensNearEqual('BONEPUSO', 'BONEPUSO2')).toBe(true); // sim 0.889
  });

  it('a transposition-style typo below the threshold needs a lower threshold', () => {
    // PONDING vs PONIDNG: distance 2 of 7 → similarity 0.714 < 0.8.
    // (Detected as a typo *signal* at 0.65 by the query generator instead.)
    expect(tokensNearEqual('PONDING', 'PONIDNG')).toBe(false);
    expect(tokensNearEqual('PONDING', 'PONIDNG', 0.65)).toBe(true);
  });

  it('rejects clearly different tokens', () => {
    expect(tokensNearEqual('BONEPUSO', 'TINANGKUNG')).toBe(false);
  });
});
