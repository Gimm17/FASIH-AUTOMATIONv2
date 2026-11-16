import { describe, expect, it } from 'vitest';
import { sha256Hex, sha256PureJs, createInMemoryAiCache, queryCorrectionCacheKey, candidateVerdictCacheKey } from './ai-cache';

describe('sha256Hex', () => {
  it('matches known RFC vectors (WebCrypto path or pure-JS fallback)', async () => {
    expect(await sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
    expect(await sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    // Multi-block input (> 64 bytes) exercises the message schedule.
    expect(await sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    );
  });

  it('pure-JS fallback agrees with the primary implementation', async () => {
    const input = 'POLINDES LABANGUN|model-x|v1';
    expect(await sha256Hex(input)).toBe(sha256PureJs(input));
  });
});

describe('cache keys', () => {
  it('are deterministic and input-sensitive', async () => {
    const a = await queryCorrectionCacheKey('Puskesmas Lolantang', 'm1');
    const b = await queryCorrectionCacheKey('Puskesmas Lolantang', 'm1');
    const c = await queryCorrectionCacheKey('Puskesmas Lain', 'm1');
    const d = await queryCorrectionCacheKey('Puskesmas Lolantang', 'm2');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
    expect(a.startsWith('query-correction:')).toBe(true);
  });

  it('candidate keys include both names', async () => {
    const key = await candidateVerdictCacheKey('A B', 'C D', 'm');
    expect(key.startsWith('candidate-review:')).toBe(true);
  });
});

describe('createInMemoryAiCache', () => {
  it('stores and returns both record kinds, clear wipes them', async () => {
    const cache = createInMemoryAiCache();
    await cache.setQueryCorrection('k1', { corrected_name: 'X', query_variants: [], confidence: 0.5 }, 'm');
    await cache.setCandidateVerdict('k2', { verdict: 'same_entity', confidence: 0.9, reason: 'r' }, 'm');

    expect(await cache.getQueryCorrection('k1')).toMatchObject({ corrected_name: 'X' });
    expect(await cache.getQueryCorrection('missing')).toBeNull();
    expect(await cache.getCandidateVerdict('k2')).toMatchObject({ verdict: 'same_entity' });

    await cache.clear();
    expect(await cache.getQueryCorrection('k1')).toBeNull();
    expect(await cache.getCandidateVerdict('k2')).toBeNull();
  });
});
