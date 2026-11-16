import { FASIH_SELECTORS } from './selectors';
import { waitForElement, setNativeInputValue, waitForDomIdle, isVisible, sleep } from './dom-utils';
import { AutomationError } from '@core/errors';
import type { WaitOptions } from './site-types';

/**
 * FASIH search input controller (IMPLEMENTATION_PLAN.md §11.1.4, §11.2).
 *
 * The search input is React-controlled; naive `input.value = x` does not trigger search.
 * We use the native setter + input/change events, assert the value stuck, then wait for
 * the results list to settle.
 *
 * Each search re-resolves a FRESH input node — React re-renders the toolbar between
 * searches and may replace the node, detaching stale references.
 */

export async function resolveSearchInput(options: WaitOptions = {}): Promise<HTMLInputElement> {
  const el = await waitForElement<HTMLInputElement>(FASIH_SELECTORS.searchInput, {
    ...options,
    errorCode: options.errorCode ?? 'SEARCH_INPUT_NOT_FOUND',
  });
  if (!(el instanceof HTMLInputElement)) {
    throw new AutomationError('SEARCH_INPUT_NOT_FOUND', 'resolved element is not an input');
  }
  if (el.disabled || el.readOnly) {
    throw new AutomationError('SEARCH_INPUT_NOT_FOUND', 'search input disabled or readonly');
  }
  if (!isVisible(el)) {
    throw new AutomationError('SEARCH_INPUT_NOT_FOUND', 'search input not visible');
  }
  return el;
}

/**
 * Run a search: clear → set query → dispatch events → assert applied → wait settle.
 * Returns the fresh input node used (callers may need it for re-search).
 */
export async function runSearch(query: string, options: WaitOptions = {}): Promise<HTMLInputElement> {
  const input = await resolveSearchInput(options);

  // Clear any previous query first.
  if (input.value) {
    setNativeInputValue(input, '');
    await sleep(150);
  }

  // Set the new query.
  if (!setNativeInputValue(input, query)) {
    // React replaced the node under us — re-resolve and retry once.
    const fresh = await resolveSearchInput({ ...options, timeoutMs: Math.min(options.timeoutMs ?? 8000, 4000) });
    setNativeInputValue(fresh, '');
    await sleep(120);
    if (!setNativeInputValue(fresh, query)) {
      throw new AutomationError('SEARCH_VALUE_NOT_APPLIED', `could not set query "${query}"`);
    }
    await waitForDomIdle(document, 400, options.timeoutMs ?? 6000, options.signal);
    return fresh;
  }

  // Assert the value actually applied (React may revert controlled inputs).
  if (input.value.trim() !== query.trim()) {
    throw new AutomationError('SEARCH_VALUE_NOT_APPLIED', `query not applied: got "${input.value}"`);
  }

  // Wait for results to settle (React render + network).
  await waitForDomIdle(document, 400, options.timeoutMs ?? 6000, options.signal);
  return input;
}

/** Clear the search input (used between candidates / to reset state). */
export async function clearSearch(options: WaitOptions = {}): Promise<void> {
  const input = await resolveSearchInput(options);
  setNativeInputValue(input, '');
  await waitForDomIdle(document, 300, options.timeoutMs ?? 4000, options.signal);
}
