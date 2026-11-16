import type { SearchCandidate } from '@shared/types';
import type { AutomationErrorCode } from '@core/errors';

/** A parsed FASIH assignment card (DOM-free primitives). */
export type ParsedCard = Omit<SearchCandidate, 'facilityType'> & {
  /** The element the card was resolved from (NOT persisted — caller must not store it). */
  transientElement?: HTMLElement;
};

export interface ResolveOptions {
  root?: ParentNode | null;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ResolvedElement<T extends Element = Element> {
  element: T;
  selector: string;
}

/** Options shared by every wait/interact helper. */
export interface WaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Poll interval (ms). Default 100. */
  intervalMs?: number;
  /** Error code thrown on timeout — use the code matching WHAT we were waiting for. */
  errorCode?: AutomationErrorCode;
}
