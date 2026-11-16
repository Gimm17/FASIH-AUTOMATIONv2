import { describe, expect, it } from 'vitest';
import { coreTokens, allTokens, isGenericToken, tokenOverlap, onlyGenericMatch, hasCoreOverlap } from './token-overlap';

describe('coreTokens', () => {
  it('drops generic facility words (plan §18.2 example)', () => {
    expect(coreTokens('TK NEGERI BONEPUSO')).toEqual(['BONEPUSO']);
  });

  it('keeps directions and numbers (they are discriminative context)', () => {
    expect(coreTokens('SMAN 1 TINANGKUNG UTARA')).toEqual(['1', 'TINANGKUNG', 'UTARA']);
  });
});

describe('tokenOverlap', () => {
  it('perfect overlap for identical cores', () => {
    const { score } = tokenOverlap('POLINDES LABANGUN', 'POLINDES LABANGUN');
    expect(score).toBe(1);
  });

  it('counts a typo\'d core token via fuzzy equivalence (≥0.8 similarity)', () => {
    const { score } = tokenOverlap('X LABANGUN', 'X LABANGUNG');
    expect(score).toBe(1);
  });

  it('a heavier typo (sim < 0.8) does NOT count — the query generator handles it instead', () => {
    const { score } = tokenOverlap('X PONDING', 'X PONIDNG');
    expect(score).toBeCloseTo(1 / 3, 5); // only 'X' matched, PONDING/PONIDNG left in the union
  });

  it('partial overlap penalized by union', () => {
    const { score } = tokenOverlap('LABANGUN BANGPANGA', 'LABANGUN');
    expect(score).toBeCloseTo(1 / 2, 5);
  });

  it('returns 0 when one side is fully generic', () => {
    const { score } = tokenOverlap('POLINDES', 'POLINDES LABANGUN');
    expect(score).toBe(0);
  });

  it('returns 0 when both are fully generic (undefined overlap)', () => {
    const { score } = tokenOverlap('POLINDES', 'POSKESDES');
    expect(score).toBe(0);
  });
});

describe('onlyGenericMatch', () => {
  it('true when no core token is shared (plan §18.2 reject rule)', () => {
    expect(onlyGenericMatch('PUSKESMAS TINANGKUNG', 'PUSKESMAS LOLANTANG')).toBe(true);
  });

  it('false when a distinctive token overlaps', () => {
    expect(onlyGenericMatch('PUSKESMAS TINANGKUNG', 'PUSKESMAS TINANGKUNG UTARA')).toBe(false);
  });
});

describe('hasCoreOverlap', () => {
  it('vacuously true when the target has no distinctive tokens', () => {
    expect(hasCoreOverlap('PUSKESMAS', 'ANYTHING HERE')).toBe(true);
  });
});

describe('generic token registry', () => {
  it('contains the plan\'s suggested list', () => {
    for (const t of ['NEGERI', 'DESA', 'PUSKESMAS', 'POLINDES', 'POSKESDES', 'POSYANDU', 'PASAR']) {
      expect(isGenericToken(t)).toBe(true);
    }
    expect(isGenericToken('TINANGKUNG')).toBe(false);
  });
});

describe('allTokens', () => {
  it('includes generic tokens', () => {
    expect(allTokens('TK NEGERI BONEPUSO')).toEqual(['TK', 'NEGERI', 'BONEPUSO']);
  });
});
