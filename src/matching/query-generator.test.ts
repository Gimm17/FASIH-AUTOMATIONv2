import { describe, expect, it } from 'vitest';
import { buildAlternativeQueries, hasTypoSignal, localTypoCorrections, stripFacilityPrefix } from '@ai/query-generator';
import type { SearchSettings } from '@shared/types';

const settings: SearchSettings = { maxQueriesPerTarget: 4, maxAiVariants: 2 };
const build = (name: string) => buildAlternativeQueries(name, settings, null);

describe('buildAlternativeQueries (deterministic, no AI)', () => {
  it('starts with the original query, then the normalized form (alias-expanded)', async () => {
    const variants = await build('SDN Ponding');
    expect(variants[0]).toEqual({ query: 'SDN Ponding', reason: 'original' });
    expect(variants[1]).toEqual({ query: 'SD NEGERI PONDING', reason: 'normalized' });
  });

  it('a name that normalizes to itself skips the redundant normalized variant', async () => {
    const variants = await build('Puskesmas Lolantang');
    expect(variants[0]?.reason).toBe('original');
    expect(variants.some((v) => v.reason === 'normalized')).toBe(false);
  });

  it('dedupes queries that normalize identically', async () => {
    const variants = await build('PUSKESMAS LOLANTANG'); // normalizes to itself
    const reasons = variants.map((v) => v.reason);
    expect(reasons.filter((r) => r === 'original')).toHaveLength(1);
  });

  it('caps the list at maxQueriesPerTarget', async () => {
    const variants = await build('SDN PONDING-PONIDNG');
    expect(variants.length).toBeLessThanOrEqual(settings.maxQueriesPerTarget);
  });

  it('includes a core-token query for discriminative names', async () => {
    const variants = await build('Polindes Labangun');
    expect(variants.some((v) => v.reason === 'core token' && v.query === 'LABANGUN')).toBe(true);
  });

  it('never queries when the name is empty', async () => {
    const variants = await build('');
    expect(variants).toHaveLength(0);
  });
});

describe('hasTypoSignal', () => {
  it('detects near-equal token pairs (PONDING vs PONIDNG)', () => {
    expect(hasTypoSignal('SDN PONDING-PONIDNG')).toBe(true);
  });

  it('no signal for clean names', () => {
    expect(hasTypoSignal('Puskesmas Lolantang')).toBe(false);
    expect(hasTypoSignal('SMAN 1 TINANGKUNG')).toBe(false);
  });
});

describe('localTypoCorrections', () => {
  const corrections = localTypoCorrections('SDN PONDING-PONIDNG');

  it('emits the corrected hyphen compound', () => {
    expect(corrections.some((v) => v.query === 'SDN PONDING-PONDING')).toBe(true);
  });

  it('emits the bare corrected token', () => {
    expect(corrections.some((v) => v.query === 'PONDING')).toBe(true);
  });

  it('no corrections for clean hyphen names', () => {
    expect(localTypoCorrections('Poskesdes Sub Desa Polintang')).toHaveLength(0);
  });
});

describe('stripFacilityPrefix', () => {
  it('removes known facility prefixes', () => {
    expect(stripFacilityPrefix('SDN PONDING')).toBe('PONDING');
    expect(stripFacilityPrefix('Puskesmas Tinangkung Utara')).toBe('Tinangkung Utara');
  });

  it('leaves unknown prefixes alone', () => {
    expect(stripFacilityPrefix('Warung Kopi')).toBe('Warung Kopi');
  });
});
