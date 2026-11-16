import { describe, expect, it } from 'vitest';
import { canTransition, isTerminal, isRetryable, hasAcceptedCandidates } from './state-machine';

describe('canTransition', () => {
  it('follows the happy path PENDING → … → DONE', () => {
    expect(canTransition('PENDING', 'PREPARING')).toBe(true);
    expect(canTransition('PREPARING', 'PRIMARY_SEARCH')).toBe(true);
    expect(canTransition('VERIFYING_PRIMARY', 'VERIFYING_FINAL')).toBe(true);
    expect(canTransition('VERIFYING_FINAL', 'EXTRACTING_IDS')).toBe(true);
    expect(canTransition('EXTRACTING_IDS', 'WRITING_RESULT')).toBe(true);
    expect(canTransition('WRITING_RESULT', 'DONE')).toBe(true);
  });

  it('any state may fall to ERROR, terminal states go nowhere', () => {
    expect(canTransition('COLLECTING_PRIMARY', 'ERROR')).toBe(true);
    expect(canTransition('DONE', 'PREPARING')).toBe(false);
    expect(canTransition('NO_MATCH', 'DONE')).toBe(false);
  });

  it('MANUAL_REVIEW can be resolved into extraction', () => {
    expect(canTransition('MANUAL_REVIEW', 'EXTRACTING_IDS')).toBe(true);
    expect(canTransition('MANUAL_REVIEW', 'DONE')).toBe(true);
  });

  it('self-transition is allowed (idempotent updates)', () => {
    expect(canTransition('PENDING', 'PENDING')).toBe(true);
  });
});

describe('isTerminal', () => {
  it('DONE / NO_MATCH / ERROR are terminal', () => {
    expect(isTerminal('DONE')).toBe(true);
    expect(isTerminal('NO_MATCH')).toBe(true);
    expect(isTerminal('ERROR')).toBe(true);
    expect(isTerminal('MANUAL_REVIEW')).toBe(false);
  });
});

describe('isRetryable', () => {
  it('only MANUAL_REVIEW and ERROR rows are retryable', () => {
    expect(isRetryable('ERROR')).toBe(true);
    expect(isRetryable('MANUAL_REVIEW')).toBe(true);
    expect(isRetryable('DONE')).toBe(false);
  });
});

describe('hasAcceptedCandidates', () => {
  it('true from EXTRACTING_IDS onwards', () => {
    expect(hasAcceptedCandidates('VERIFYING_FINAL')).toBe(false);
    expect(hasAcceptedCandidates('EXTRACTING_IDS')).toBe(true);
    expect(hasAcceptedCandidates('DONE')).toBe(true);
  });
});
