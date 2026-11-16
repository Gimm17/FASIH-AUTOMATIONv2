import { describe, expect, it } from 'vitest';
import { withRetry } from './retry';
import { AutomationError, CancellationError } from './errors';

describe('withRetry', () => {
  it('retries retryable errors until success', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls < 3) throw new AutomationError('DOM_CHANGED', 'transient');
        return Promise.resolve('ok');
      },
      { attempts: 3, backoffMs: [1, 1] },
    );
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('gives up after the attempt budget and rethrows as AutomationError', async () => {
    await expect(
      withRetry(() => Promise.reject(new AutomationError('SEARCH_TIMEOUT', 'boom')), {
        attempts: 2,
        backoffMs: [1, 1],
      }),
    ).rejects.toMatchObject({ code: 'SEARCH_TIMEOUT' });
  });

  it('does NOT retry non-retryable errors (auth)', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.reject(new AutomationError('AI_AUTH_FAILED', '401'));
        },
        { attempts: 3, backoffMs: [1, 1] },
      ),
    ).rejects.toMatchObject({ code: 'AI_AUTH_FAILED' });
    expect(calls).toBe(1);
  });

  it('cancellation propagates immediately without retry', async () => {
    let calls = 0;
    await expect(
      withRetry(
        () => {
          calls++;
          return Promise.reject(new CancellationError('STOP'));
        },
        { attempts: 3, backoffMs: [1, 1] },
      ),
    ).rejects.toBeInstanceOf(CancellationError);
    expect(calls).toBe(1);
  });

  it('wraps unknown errors as retryable DOM_CHANGED', async () => {
    let calls = 0;
    const result = await withRetry(
      () => {
        calls++;
        if (calls === 1) throw new Error('random network hiccup');
        return Promise.resolve(7);
      },
      { attempts: 2, backoffMs: [1, 1] },
    );
    expect(result).toBe(7);
    expect(calls).toBe(2);
  });
});
