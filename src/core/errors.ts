import { RETRYABLE_ERROR_CODES, NON_RETRYABLE_ERROR_CODES, ABORT_REASON_STOP, ABORT_REASON_PAUSE } from '@shared/constants';

/** Canonical error codes — see IMPLEMENTATION_PLAN.md §36. */
export type AutomationErrorCode =
  | 'EXCEL_INVALID'
  | 'EXCEL_HEADER_MISSING'
  | 'FASIH_TAB_NOT_FOUND'
  | 'FASIH_NOT_LOGGED_IN'
  | 'SEARCH_INPUT_NOT_FOUND'
  | 'SEARCH_TIMEOUT'
  | 'SEARCH_VALUE_NOT_APPLIED'
  | 'RESULT_CONTAINER_NOT_FOUND'
  | 'CARD_PARSE_FAILED'
  | 'EXACT_CARD_NOT_FOUND'
  | 'DRAWER_OPEN_TIMEOUT'
  | 'DRAWER_OPEN_FAILED'
  | 'DRAWER_NOT_FOUND'
  | 'REVIEW_ACTION_NOT_FOUND'
  | 'REVIEW_ACTION_INVALID'
  | 'REVIEW_HREF_MISSING'
  | 'INVALID_REVIEW_HREF'
  | 'ASSIGNMENT_UUID_NOT_FOUND'
  | 'SELF_ASSIGNMENT_ID_COLLISION'
  | 'DRAWER_CLOSE_FAILED'
  | 'AI_CONNECTION_FAILED'
  | 'AI_AUTH_FAILED'
  | 'AI_INVALID_RESPONSE'
  | 'AI_UNREACHABLE'
  | 'DOM_CHANGED'
  | 'LIST_VIEW_TOGGLE_NOT_FOUND'
  | 'LIST_VIEW_SWITCH_FAILED'
  | 'JOB_CANCELLED';

export class AutomationError extends Error {
  readonly code: AutomationErrorCode;
  readonly retryable: boolean;
  readonly context?: Record<string, unknown>;

  constructor(
    code: AutomationErrorCode,
    message?: string,
    context?: Record<string, unknown>,
  ) {
    super(message ?? code);
    this.name = 'AutomationError';
    this.code = code;
    this.retryable = RETRYABLE_ERROR_CODES.has(code) && !NON_RETRYABLE_ERROR_CODES.has(code);
    this.context = context;
  }
}

/** Aborted because the user paused/stopped (NOT a real error). */
export class CancellationError extends Error {
  readonly reason: 'PAUSE' | 'STOP';
  constructor(reason: 'PAUSE' | 'STOP') {
    super(`cancelled:${reason}`);
    this.name = 'CancellationError';
    this.reason = reason;
  }
}

export function isCancellation(value: unknown): value is CancellationError {
  return value instanceof CancellationError || isAbortReason(value);
}

export function isAbortReason(value: unknown): value is AbortReason {
  if (value === ABORT_REASON_STOP) return true;
  if (value === ABORT_REASON_PAUSE) return true;
  if (typeof value === 'object' && value !== null) {
    const reason = (value as { reason?: unknown }).reason;
    return reason === ABORT_REASON_STOP || reason === ABORT_REASON_PAUSE;
  }
  if (typeof value === 'string') {
    return value === ABORT_REASON_STOP || value === ABORT_REASON_PAUSE;
  }
  return false;
}

export interface AbortReason {
  reason: 'PAUSE' | 'STOP';
}

/** Throw a typed AutomationError — convenience wrapper that keeps call sites concise. */
export function fail(
  code: AutomationErrorCode,
  contextOrMessage?: Record<string, unknown> | string,
  contextIfMessage?: Record<string, unknown>,
): never {
  if (typeof contextOrMessage === 'string') {
    throw new AutomationError(code, contextOrMessage, contextIfMessage);
  }
  throw new AutomationError(code, undefined, contextOrMessage);
}

/** Normalize any thrown value into a stable AutomationError (for persistence / logging). */
export function normalizeError(value: unknown): AutomationError {
  if (value instanceof AutomationError) return value;
  if (value instanceof CancellationError) {
    return new AutomationError('JOB_CANCELLED', value.message, { reason: value.reason });
  }
  if (value instanceof Error) {
    return new AutomationError('DOM_CHANGED', value.message);
  }
  return new AutomationError('DOM_CHANGED', String(value));
}
