import { describe, expect, it } from 'vitest';
import { extractAssignmentUuid, isUuid, isSameAssignmentId } from './uuid';

const PERIOD = '11111111-2222-4333-8444-555555555555';
const ASSIGNMENT = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('extractAssignmentUuid', () => {
  it('extracts the SECOND UUID from the /app/assignment/{period}/{assignment} route', () => {
    const href = `https://fasih-sm.bps.go.id/app/assignment/${PERIOD}/${ASSIGNMENT}`;
    expect(extractAssignmentUuid(href)).toBe(ASSIGNMENT);
  });

  it('falls back to the LAST UUID in the path when the route differs', () => {
    const href = `https://fasih-sm.bps.go.id/some/other/${PERIOD}/${ASSIGNMENT}`;
    expect(extractAssignmentUuid(href)).toBe(ASSIGNMENT);
  });

  it('ignores UUIDs in query params (path wins)', () => {
    const href = `https://fasih-sm.bps.go.id/app/assignment/${PERIOD}/${ASSIGNMENT}?ref=${PERIOD}`;
    expect(extractAssignmentUuid(href)).toBe(ASSIGNMENT);
  });

  it('lowercases and accepts a single UUID', () => {
    expect(extractAssignmentUuid(`https://x.id/detail/${ASSIGNMENT.toUpperCase()}`)).toBe(ASSIGNMENT);
  });

  it('returns empty string instead of fabricating one', () => {
    expect(extractAssignmentUuid('https://fasih-sm.bps.go.id/app/assignment/')).toBe('');
    expect(extractAssignmentUuid('')).toBe('');
    expect(extractAssignmentUuid(null)).toBe('');
    expect(extractAssignmentUuid('not-a-uuid')).toBe('');
  });
});

describe('isUuid', () => {
  it('validates shape, not just length', () => {
    expect(isUuid(ASSIGNMENT)).toBe(true);
    expect(isUuid('aaaaaaaa-bbbb-4ccc-zddd-eeeeeeeeeeee')).toBe(false); // invalid variant nibble
    expect(isUuid(42)).toBe(false);
    expect(isUuid('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee')).toBe(false); // too short
  });
});

describe('isSameAssignmentId', () => {
  it('case-insensitive comparison', () => {
    expect(isSameAssignmentId(ASSIGNMENT, ASSIGNMENT.toUpperCase())).toBe(true);
    expect(isSameAssignmentId(ASSIGNMENT, PERIOD)).toBe(false);
    expect(isSameAssignmentId(undefined, PERIOD)).toBe(false);
  });
});
