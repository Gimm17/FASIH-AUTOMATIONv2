import { describe, expect, it } from 'vitest';
import { extractJson, parseAiQueryCorrection, parseAiCandidateVerdict } from './schemas';

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('```\n[1,2]\n```')).toEqual([1, 2]);
  });

  it('finds the first balanced object inside prose', () => {
    expect(extractJson('Sure! Here is the result: {"verdict":"same_entity","confidence":0.9} — hope it helps')).toEqual({
      verdict: 'same_entity',
      confidence: 0.9,
    });
  });

  it('handles strings containing braces without losing balance', () => {
    expect(extractJson('{"reason":"has {braces} inside","confidence":0.5}')).toEqual({
      reason: 'has {braces} inside',
      confidence: 0.5,
    });
  });

  it('throws typed errors for garbage', () => {
    expect(() => extractJson('no json here')).toThrow('AI_INVALID_RESPONSE');
    expect(() => extractJson('')).toThrow('AI_INVALID_RESPONSE');
    expect(() => extractJson('{"unbalanced": true')).toThrow('AI_INVALID_RESPONSE');
  });
});

describe('parseAiQueryCorrection', () => {
  it('accepts a schema-conformant response', () => {
    const parsed = parseAiQueryCorrection('{"corrected_name":"SDN PONDING-PONDING","query_variants":["PONDING"],"confidence":0.9}');
    expect(parsed.corrected_name).toBe('SDN PONDING-PONDING');
    expect(parsed.query_variants).toEqual(['PONDING']);
  });

  it('synthesizes an object when the AI returned only an array of variants', () => {
    const parsed = parseAiQueryCorrection('["PONDING-PONDING","PONDING"]');
    expect(parsed.corrected_name).toBe('PONDING-PONDING');
    expect(parsed.query_variants).toEqual(['PONDING-PONDING', 'PONDING']);
    expect(parsed.confidence).toBe(0.5);
  });

  it('rejects out-of-range confidence', () => {
    expect(() => parseAiQueryCorrection('{"corrected_name":"X","query_variants":[],"confidence":1.5}')).toThrow(
      'AI_INVALID_RESPONSE',
    );
  });
});

describe('parseAiCandidateVerdict', () => {
  it('accepts a valid verdict (fenced)', () => {
    const parsed = parseAiCandidateVerdict('```json\n{"verdict":"different_entity","confidence":0.87,"reason":"beda nomor"}\n```');
    expect(parsed.verdict).toBe('different_entity');
    expect(parsed.confidence).toBe(0.87);
  });

  it('rejects unknown verdict values', () => {
    expect(() => parseAiCandidateVerdict('{"verdict":"maybe","confidence":0.5,"reason":"?"}')).toThrow('AI_INVALID_RESPONSE');
  });
});
