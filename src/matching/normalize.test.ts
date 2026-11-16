import { describe, expect, it } from 'vitest';
import { normalizeName, normalizeIdentityCode, isSameIdentityCode, normalizeQuery, tokenize } from './normalize';

describe('normalizeName', () => {
  it('uppercases and collapses whitespace', () => {
    expect(normalizeName('  puskesmas   lolantang ')).toBe('PUSKESMAS LOLANTANG');
  });

  it('strips diacritics', () => {
    expect(normalizeName('Puskésmas Lolantang')).toBe('PUSKESMAS LOLANTANG');
  });

  it('expands well-known school abbreviations', () => {
    expect(normalizeName('SDN Ponding')).toBe('SD NEGERI PONDING');
    expect(normalizeName('SMAN 1 Tinangkung')).toBe('SMA NEGERI 1 TINANGKUNG');
    expect(normalizeName('SMKN 1 Bonepuso')).toBe('SMK NEGERI 1 BONEPUSO');
  });

  it('does NOT expand MI (Madrasah Ibtidaiyah is not necessarily negeri)', () => {
    expect(normalizeName('MI Al-Ikhlas')).toBe('MI AL-IKHLAS');
  });

  it('preserves hyphens inside compound tokens', () => {
    expect(normalizeName('SDN PONDING-PONIDNG')).toBe('SD NEGERI PONDING-PONIDNG');
  });

  it('normalizes punctuation to spaces', () => {
    expect(normalizeName('Posyandu Melati, Puskesmas Tinangkung Utara')).toBe(
      'POSYANDU MELATI PUSKESMAS TINANGKUNG UTARA',
    );
  });
});

describe('normalizeIdentityCode', () => {
  it('strips region prefixes like "7201 - "', () => {
    expect(normalizeIdentityCode('7201 - SE26mpvzxsBE0A')).toBe('SE26MPVZXSBE0A');
  });

  it('strips long numeric prefixes', () => {
    expect(normalizeIdentityCode('7201042004000100 – SE26mpewbw33D8')).toBe('SE26MPEWBW33D8');
  });

  it('is exact, never fuzzy', () => {
    expect(normalizeIdentityCode('SE26mpvzxsBE0A')).not.toBe(normalizeIdentityCode('SE26mpvzxsBE0B'));
  });
});

describe('isSameIdentityCode', () => {
  it('matches a prefixed target code with a bare candidate code', () => {
    expect(isSameIdentityCode('7201 - SE26mpvzxsBE0A', 'SE26mpvzxsBE0A')).toBe(true);
  });

  it('rejects different codes', () => {
    expect(isSameIdentityCode('SE26mpvzxsBE0A', 'SE26mpewbw33D8')).toBe(false);
  });

  it('rejects empty comparisons', () => {
    expect(isSameIdentityCode('', '')).toBe(false);
    expect(isSameIdentityCode(undefined, 'SE26X')).toBe(false);
  });
});

describe('normalizeQuery', () => {
  it('uppercases + collapses but keeps it light', () => {
    expect(normalizeQuery(' sdn  ponding ')).toBe('SDN PONDING');
  });
});

describe('tokenize', () => {
  it('splits on whitespace and drops empties', () => {
    expect(tokenize('A  B\tC')).toEqual(['A', 'B', 'C']);
    expect(tokenize('')).toEqual([]);
  });
});
