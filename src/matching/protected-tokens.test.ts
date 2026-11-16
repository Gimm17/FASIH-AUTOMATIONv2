import { describe, expect, it } from 'vitest';
import {
  extractProtectedTokens,
  protectedTokensCompatible,
  extractDirectionTokens,
  DIRECTION_TOKENS,
} from './protected-tokens';

describe('extractProtectedTokens', () => {
  it('collects directions, numbers, and roman numerals', () => {
    expect(extractProtectedTokens('SMAN 1 TINANGKUNG UTARA')).toEqual(['1', 'UTARA']);
    expect(extractProtectedTokens('Poskesdes Bulagi II')).toEqual(['II']);
  });

  it('strips trailing punctuation from numbers ("1." → "1")', () => {
    expect(extractProtectedTokens('SD 1. TINANGKUNG')).toEqual(['1']);
  });

  it('empty for names without protected tokens', () => {
    expect(extractProtectedTokens('Polindes Labangun')).toEqual([]);
  });
});

describe('protectedTokensCompatible (plan §17 — candidate ⊆ target)', () => {
  it('compatible when sets are equal', () => {
    expect(protectedTokensCompatible('SMAN 1 TINANGKUNG UTARA', 'SMAN 1 TINANGKUNG UTARA')).toBe(true);
  });

  it('HARD REJECT: candidate carries a direction the target lacks (plan §17.1)', () => {
    expect(protectedTokensCompatible('SMAN 1 TINANGKUNG', 'SMAN 1 TINANGKUNG UTARA')).toBe(false);
    expect(protectedTokensCompatible('SMAN 1 TINANGKUNG', 'SMAN 1 TINANGKUNG SELATAN')).toBe(false);
  });

  it('HARD REJECT: number mismatch (SMAN 1 vs SMAN 2)', () => {
    expect(protectedTokensCompatible('SMAN 1 TINANGKUNG', 'SMAN 2 TINANGKUNG')).toBe(false);
  });

  it('allowed: candidate missing a token the target has (FASIH names are less specific)', () => {
    expect(protectedTokensCompatible('SMAN 1 TINANGKUNG UTARA', 'SMAN 1 TINANGKUNG')).toBe(true);
    expect(protectedTokensCompatible('SMAN 1 TINANGKUNG', 'SMAN TINANGKUNG')).toBe(true);
  });

  it('allowed: neither side has protected tokens', () => {
    expect(protectedTokensCompatible('Polindes Labangun', 'Polindes Labangung')).toBe(true);
  });
});

describe('extractDirectionTokens', () => {
  it('returns only the direction subset', () => {
    expect(extractDirectionTokens('PUSKESMAS TINANGKUNG UTARA 2')).toEqual(['UTARA']);
  });
});

describe('DIRECTION_TOKENS', () => {
  it('covers the plan\'s minimum list', () => {
    for (const t of ['UTARA', 'SELATAN', 'TIMUR', 'BARAT', 'TENGAH', 'HULU', 'HILIR']) {
      expect(DIRECTION_TOKENS.has(t)).toBe(true);
    }
  });
});
