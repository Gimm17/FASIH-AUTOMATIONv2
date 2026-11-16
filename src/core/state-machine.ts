import type { RowState } from '@shared/constants';

/**
 * Explicit per-row state machine. Transitions are guarded so resume/retry never land
 * the row in an invalid state. IMPLEMENTATION_PLAN.md §9.
 */

export const ROW_TRANSITIONS: Record<RowState, RowState[]> = {
  PENDING: ['PREPARING', 'ERROR'],
  PREPARING: ['PRIMARY_SEARCH', 'ERROR'],
  PRIMARY_SEARCH: ['COLLECTING_PRIMARY', 'ERROR'],
  COLLECTING_PRIMARY: ['VERIFYING_PRIMARY', 'ERROR'],
  VERIFYING_PRIMARY: ['VERIFYING_FINAL', 'GENERATING_ALTERNATIVES', 'NO_MATCH', 'MANUAL_REVIEW', 'ERROR'],
  GENERATING_ALTERNATIVES: ['ALTERNATE_SEARCH', 'ERROR'],
  ALTERNATE_SEARCH: ['VERIFYING_FINAL', 'NO_MATCH', 'MANUAL_REVIEW', 'ERROR'],
  VERIFYING_FINAL: ['EXTRACTING_IDS', 'NO_MATCH', 'MANUAL_REVIEW', 'ERROR'],
  EXTRACTING_IDS: ['WRITING_RESULT', 'ERROR'],
  WRITING_RESULT: ['DONE', 'ERROR'],
  DONE: [],
  NO_MATCH: [],
  MANUAL_REVIEW: ['EXTRACTING_IDS', 'WRITING_RESULT', 'DONE'],
  ERROR: ['PREPARING', 'PRIMARY_SEARCH', 'COLLECTING_PRIMARY', 'VERIFYING_PRIMARY', 'ALTERNATE_SEARCH', 'VERIFYING_FINAL', 'EXTRACTING_IDS'],
};

export const TERMINAL_STATES: ReadonlySet<RowState> = new Set<RowState>([
  'DONE',
  'NO_MATCH',
  'ERROR',
]);

export function canTransition(from: RowState, to: RowState): boolean {
  if (from === to) return true;
  return ROW_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(state: RowState): boolean {
  return TERMINAL_STATES.has(state);
}

export function isRetryable(state: RowState): boolean {
  // MANUAL_REVIEW can be resolved (Accept → EXTRACTING_IDS). ERROR can be retried.
  return state === 'MANUAL_REVIEW' || state === 'ERROR';
}

/** True when the state machine has produced accepted duplicates (extraction phase or beyond). */
export function hasAcceptedCandidates(state: RowState): boolean {
  return (
    state === 'EXTRACTING_IDS' ||
    state === 'WRITING_RESULT' ||
    state === 'DONE'
  );
}
