import { describe, expect, it } from 'vitest';
import { dedupeAndSortDuplicates, formatDuplicateIds, formatDuplicateNames } from './dedupe';

const UUID_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const UUID_B = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('dedupeAndSortDuplicates', () => {
  it('drops duplicates by assignment UUID (same candidate seen via multiple queries)', () => {
    const out = dedupeAndSortDuplicates([
      { candidateCode: 'SE26aaa', candidateName: 'Polindes Labangun', assignmentId: UUID_A },
      { candidateCode: 'SE26aaa', candidateName: 'Polindes Labangun (varian query)', assignmentId: UUID_A },
    ]);
    expect(out).toHaveLength(1);
  });

  it('sorts by normalized candidate name deterministically', () => {
    const out = dedupeAndSortDuplicates([
      { candidateCode: 'SE26zzz', candidateName: 'polindes zebra', assignmentId: UUID_B },
      { candidateCode: 'SE26aaa', candidateName: 'Polindes Alpabet', assignmentId: UUID_A },
    ]);
    expect(out.map((d) => d.candidateName)).toEqual(['Polindes Alpabet', 'polindes zebra']);
  });

  it('drops entries without an assignment id (extraction failed)', () => {
    const out = dedupeAndSortDuplicates([
      { candidateCode: 'SE26aaa', candidateName: 'X', assignmentId: '' },
    ]);
    expect(out).toHaveLength(0);
  });
});

describe('formatDuplicateIds / formatDuplicateNames (plan §31: pairwise aligned)', () => {
  const duplicates = [
    { candidateCode: 'SE26zzz', candidateName: 'Zed', assignmentId: UUID_B },
    { candidateCode: 'SE26aaa', candidateName: 'Abi', assignmentId: UUID_A },
    { candidateCode: 'SE26mmm', candidateName: 'Abi2', assignmentId: UUID_A }, // same UUID again
  ];

  it('ids and names come from the same dedup+sort pass, in the same order', () => {
    const ids = formatDuplicateIds(duplicates).split(';');
    const names = formatDuplicateNames(duplicates).split(';');
    expect(ids).toEqual([UUID_A, UUID_B]);
    expect(names).toEqual(['Abi', 'Zed']);
  });

  it('respects the configured separator', () => {
    expect(formatDuplicateIds(duplicates, ', ')).toContain(', ');
  });
});
