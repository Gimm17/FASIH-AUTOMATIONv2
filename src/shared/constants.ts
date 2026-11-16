// String-literal union types and constant registries used across the extension.
// Kept here (not in types.ts) so the matching engine and UI can import the same enums
// without a circular dependency on the full type surface.

export const FASIH_ORIGIN = 'https://fasih-sm.bps.go.id';
export const FASIH_SEARCH_PATH_PREFIX = '/app/assignment'; // route segment we look for in review hrefs
export const FASIH_URL_PATTERN = 'https://fasih-sm.bps.go.id/*';

/** Facility classification result. */
export type FacilityType =
  | 'EDU_TK'
  | 'EDU_KB'
  | 'EDU_PAUD'
  | 'EDU_SD'
  | 'EDU_SMP'
  | 'EDU_SMA'
  | 'EDU_SMK'
  | 'HEALTH_PUSKESMAS'
  | 'HEALTH_PUSTU'
  | 'HEALTH_POLINDES'
  | 'HEALTH_POSKESDES'
  | 'HEALTH_POSYANDU'
  | 'MARKET'
  | 'GOVERNMENT'
  | 'OTHER'
  | 'UNKNOWN';

/** Decision produced by the deterministic candidate verifier. */
export type CandidateDecision =
  | 'ACCEPT'
  | 'REJECT_SELF'
  | 'REJECT_FACILITY'
  | 'REJECT_PROTECTED_TOKEN'
  | 'REJECT_SCORE'
  | 'AI_REVIEW'
  | 'MANUAL_REVIEW';

/** Per-target state machine state. */
export type RowState =
  | 'PENDING'
  | 'PREPARING'
  | 'PRIMARY_SEARCH'
  | 'COLLECTING_PRIMARY'
  | 'VERIFYING_PRIMARY'
  | 'GENERATING_ALTERNATIVES'
  | 'ALTERNATE_SEARCH'
  | 'VERIFYING_FINAL'
  | 'EXTRACTING_IDS'
  | 'WRITING_RESULT'
  | 'DONE'
  | 'NO_MATCH'
  | 'MANUAL_REVIEW'
  | 'ERROR';

/** AI adjudication verdict. */
export type AiVerdict = 'same_entity' | 'different_entity' | 'uncertain';

/** Top-level job lifecycle status. */
export type JobStatus = 'READY' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'DONE' | 'ERROR';

/** Retryable-vs-non-retryable mapping for typed errors. */
export const RETRYABLE_ERROR_CODES = new Set<string>([
  'SEARCH_TIMEOUT',
  'DRAWER_OPEN_TIMEOUT',
  'DRAWER_NOT_FOUND',
  'AI_UNREACHABLE',
  'DOM_CHANGED',
  'SEARCH_INPUT_NOT_FOUND',
  'RESULT_CONTAINER_NOT_FOUND',
]);

export const NON_RETRYABLE_ERROR_CODES = new Set<string>([
  'EXCEL_HEADER_MISSING',
  'AI_AUTH_FAILED',
  'JOB_CANCELLED',
]);

export const PROMPT_VERSION = 'v1';
export const DUPLICATE_SEPARATOR = ';';

/** Cancellation reasons carried in AbortController.abort(reason). */
export const ABORT_REASON_PAUSE = 'PAUSE';
export const ABORT_REASON_STOP = 'STOP';
