import { ABORT_REASON_PAUSE, ABORT_REASON_STOP } from '@shared/constants';
import { CancellationError } from './errors';

/**
 * Cancellation controller for pause/resume/stop. The job engine holds a single
 * "active" controller; pause stops the current operation (via abort) but keeps the
 * job resumable; stop aborts permanently.
 */
export class JobCancellationToken {
  private controller = new AbortController();
  private _paused = false;
  private _stopped = false;

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  get paused(): boolean {
    return this._paused;
  }

  get stopped(): boolean {
    return this._stopped;
  }

  /** Cancel current in-flight operation for a pause (caller is expected to gate). */
  pause(): void {
    this._paused = true;
    this.abortCurrent(ABORT_REASON_PAUSE);
  }

  /** Resume: a fresh signal so work can continue. */
  resume(): void {
    if (this._stopped) return;
    this._paused = false;
    this.controller = new AbortController();
  }

  /** Permanently stop the job. */
  stop(): void {
    this._stopped = true;
    this._paused = false;
    this.abortCurrent(ABORT_REASON_STOP);
  }

  /** Re-init (used when a job is (re)started). */
  reset(): void {
    this._paused = false;
    this._stopped = false;
    this.controller = new AbortController();
  }

  private abortCurrent(reason: typeof ABORT_REASON_PAUSE | typeof ABORT_REASON_STOP): void {
    if (!this.controller.signal.aborted) {
      this.controller.abort(reason);
    }
  }
}

/** Throws a CancellationError if the signal is aborted; otherwise a no-op. */
export function assertNotCancelled(token: JobCancellationToken | AbortSignal): void {
  const signal = 'signal' in token ? token.signal : token;
  if (signal.aborted) {
    const reason = readReason(signal);
    throw new CancellationError(reason === 'STOP' ? 'STOP' : 'PAUSE');
  }
}

function readReason(signal: AbortSignal): 'PAUSE' | 'STOP' | null {
  const raw = (signal as unknown as { reason?: unknown }).reason;
  if (raw === ABORT_REASON_STOP) return 'STOP';
  if (raw === ABORT_REASON_PAUSE) return 'PAUSE';
  if (typeof raw === 'object' && raw !== null) {
    const r = (raw as { reason?: string }).reason;
    if (r === ABORT_REASON_STOP) return 'STOP';
    if (r === ABORT_REASON_PAUSE) return 'PAUSE';
  }
  return null;
}

/** Bridge an AbortSignal into a promise rejection (throws DOMException on abort). */
export function abortableTimeout(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new CancellationError(readReason(signal) === 'STOP' ? 'STOP' : 'PAUSE'));
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new CancellationError(readReason(signal) === 'STOP' ? 'STOP' : 'PAUSE'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Small debounce jitter (100–400ms). Not a synchronization primitive. */
export function jitter(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
