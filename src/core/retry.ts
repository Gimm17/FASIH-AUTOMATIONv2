import type { RetrySettings } from '@shared/types';
import { AutomationError, CancellationError, isCancellation } from './errors';
import { jitter } from './cancellation';

/**
 * Retry with exponential backoff for retryable AutomationErrors.
 * - Retries only when err.retryable === true (or an unknown transient).
 * - 4xx auth / config errors are non-retryable → rethrow immediately.
 * - Cancellation errors (pause/stop) propagate without retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts: number; backoffMs?: number[]; signal?: AbortSignal; onRetry?: (info: { attempt: number; error: Error }) => void },
): Promise<T> {
  const attempts = Math.max(1, opts.attempts);
  const backoff = opts.backoffMs ?? [500, 1000];
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new CancellationError('STOP');
    }
    try {
      return await fn();
    } catch (err) {
      if (isCancellation(err)) throw err;
      lastError = err;
      const automationErr =
        err instanceof AutomationError
          ? err
          : err instanceof Error
            ? new AutomationError('DOM_CHANGED', err.message)
            : new AutomationError('DOM_CHANGED', String(err));

      if (!automationErr.retryable || attempt === attempts) {
        throw automationErr;
      }

      opts.onRetry?.({ attempt, error: automationErr });
      const delay = backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 1000;
      await jitter(delay);
    }
  }
  // Unreachable, but satisfies the type checker.
  throw lastError instanceof Error ? lastError : new AutomationError('DOM_CHANGED', 'retry exhausted');
}

export function backoffSchedule(): number[] {
  return [500, 1000];
}

export function retryBudget(settings: RetrySettings): RetrySettings {
  return settings;
}
