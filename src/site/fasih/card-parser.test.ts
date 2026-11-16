import { describe, expect, it } from 'vitest';
import { extractCodeFromText, cleanCardName } from './card-parser';

describe('extractCodeFromText (SE-code format: SE + 2 digits + 8-12 alnum)', () => {
  it('extracts real FASIH-style SE codes', () => {
    expect(extractCodeFromText('SE26mpewbw33D8 - Polindes Labangun')).toBe('SE26mpewbw33D8');
    expect(extractCodeFromText('detail untuk SE26mpvzxsBE0A')).toBe('SE26mpvzxsBE0A');
  });

  it('NEVER mistakes plain words for codes (regression: SEMARANG/SEJAHTERA)', () => {
    expect(extractCodeFromText('PUSKESMAS SEMARANG SELATAN')).toBeNull();
    expect(extractCodeFromText('CV SEJAHTERA ABADI')).toBeNull();
    expect(extractCodeFromText('SEMARANG')).toBeNull();
  });

  it('falls back to a leading numeric prefix before a dash', () => {
    expect(extractCodeFromText('7201042004000100 – Polindes X')).toBe('7201042004000100');
    expect(extractCodeFromText('7201 - Target')).toBe('7201');
  });

  it('falls back to a standalone 16-digit code', () => {
    expect(extractCodeFromText('kode 7201042004000100 valid')).toBe('7201042004000100');
  });

  it('null for empty/garbage', () => {
    expect(extractCodeFromText('')).toBeNull();
    expect(extractCodeFromText(null)).toBeNull();
    expect(extractCodeFromText('tanpa kode apapun')).toBeNull();
  });
});

describe('cleanCardName', () => {
  it('prefers the name hint when provided', () => {
    expect(cleanCardName('SE26aaa - whatever', 'Polindes Labangun')).toBe('Polindes Labangun');
  });

  it('strips leading SE-code and metadata after pipe', () => {
    expect(cleanCardName('SE26mpewbw33D8 - Polindes Labangun | SLS-2023')).toBe('Polindes Labangun');
    expect(cleanCardName('7201042004000100 - Posyandu Melati')).toBe('Posyandu Melati');
  });

  it('keeps the raw text when nothing strips', () => {
    expect(cleanCardName('Polindes Bangpanga')).toBe('Polindes Bangpanga');
    expect(cleanCardName('')).toBe('');
  });
});
