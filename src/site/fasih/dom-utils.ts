import { AutomationError, CancellationError } from '@core/errors';
import { findFirstMatchingSelector } from './selectors';
import type { WaitOptions, ResolvedElement } from './site-types';

/**
 * Reusable DOM utilities (IMPLEMENTATION_PLAN.md §35, §48).
 * Every helper: supports timeout, supports AbortSignal, throws typed errors, never
 * silent-fails, re-checks isConnected before interacting, and never relies on stale
 * DOM nodes from a virtualized list.
 */

const DEFAULT_TIMEOUT = 8000;
const DEFAULT_INTERVAL = 100;

function isAborted(signal?: AbortSignal): boolean {
  return !!signal?.aborted;
}

/** Throw a cancellation error if the signal is aborted. */
export function assertSignal(signal?: AbortSignal): void {
  if (isAborted(signal)) throw new CancellationError('STOP');
}

/** True when an element is visible (non-zero box, not display:none/hidden/opacity:0). */
export function isVisible(el: Element | null | undefined): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (!el.isConnected) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (Number(style.opacity ?? '1') <= 0) return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isElementConnected(el: Element | null): boolean {
  return !!el && el.isConnected;
}

/** True when a button is connected, not disabled, and visible. */
export function isUsableButton(el: Element | null): el is HTMLButtonElement {
  return el instanceof HTMLButtonElement && el.isConnected && !el.disabled && isVisible(el);
}

/** Wait for an element matching any selector to appear, polling + MutationObserver. */
export async function waitForElement<T extends Element = Element>(
  selectors: readonly string[],
  options: WaitOptions = {},
): Promise<T> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const interval = options.intervalMs ?? DEFAULT_INTERVAL;
  const errorCode = options.errorCode ?? 'DOM_CHANGED';
  const root = document;

  const deadline = nowMs() + timeout;
  // Fast path.
  const fast = findFirstMatchingSelector<T>(selectors, root);
  if (fast) return fast;

  return new Promise<T>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      // NOTE: abort/cancellation is handled by the poll interval below — throwing
      // synchronously inside a MutationObserver callback would be an uncaught error.
      const el = findFirstMatchingSelector<T>(selectors, root);
      if (el) {
        cleanup();
        resolve(el);
      }
    });
    const cleanup = () => {
      observer.disconnect();
      clearInterval(poll);
      clearTimeout(timer);
    };
    observer.observe(root, { childList: true, subtree: true });
    const poll = setInterval(() => {
      if (isAborted(options.signal)) {
        cleanup();
        reject(new CancellationError('STOP'));
        return;
      }
      const el = findFirstMatchingSelector<T>(selectors, root);
      if (el) {
        cleanup();
        resolve(el);
      } else if (nowMs() > deadline) {
        cleanup();
        reject(new AutomationError(errorCode, `waitForElement timed out after ${timeout}ms`));
      }
    }, interval);
    const timer = setTimeout(() => {
      cleanup();
      reject(new AutomationError(errorCode, `waitForElement timed out after ${timeout}ms`));
    }, timeout);
  });
}

/** Wait for an element matching a predicate (validator). */
export async function waitForElementMatching<T extends Element = Element>(
  selectors: readonly string[],
  validate: (el: Element) => el is T,
  options: WaitOptions = {},
): Promise<ResolvedElement<T>> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const interval = options.intervalMs ?? DEFAULT_INTERVAL;
  const errorCode = options.errorCode ?? 'DOM_CHANGED';
  const deadline = nowMs() + timeout;

  for (;;) {
    assertSignal(options.signal);
    for (const sel of selectors) {
      let el: Element | null = null;
      try {
        el = document.querySelector<T>(sel);
      } catch {
        continue;
      }
      if (el && validate(el)) return { element: el, selector: sel };
    }
    if (nowMs() > deadline) {
      throw new AutomationError(errorCode, `waitForElementMatching timed out after ${timeout}ms`);
    }
    await sleep(interval);
  }
}

/** Wait for an element to disappear (removed OR hidden). */
export async function waitForElementGone(selectors: readonly string[], options: WaitOptions = {}): Promise<void> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const interval = options.intervalMs ?? DEFAULT_INTERVAL;
  const errorCode = options.errorCode ?? 'DRAWER_CLOSE_FAILED';
  const deadline = nowMs() + timeout;
  for (;;) {
    assertSignal(options.signal);
    const el = findFirstMatchingSelector(selectors, document);
    if (!el || !isVisible(el)) return;
    if (nowMs() > deadline) {
      throw new AutomationError(errorCode, `waitForElementGone timed out after ${timeout}ms`);
    }
    await sleep(interval);
  }
}

/** Wait for a specific element to be gone or hidden. */
export async function waitForElementGoneOrHidden(element: HTMLElement, options: WaitOptions = {}): Promise<void> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const interval = options.intervalMs ?? DEFAULT_INTERVAL;
  const errorCode = options.errorCode ?? 'DRAWER_CLOSE_FAILED';
  const deadline = nowMs() + timeout;
  for (;;) {
    assertSignal(options.signal);
    if (!element.isConnected || !isVisible(element)) return;
    if (nowMs() > deadline) {
      throw new AutomationError(errorCode, `waitForElementGoneOrHidden timed out after ${timeout}ms`);
    }
    await sleep(interval);
  }
}

/** Poll a predicate until it returns true or timeout. */
export async function waitForCondition(predicate: () => boolean, options: WaitOptions = {}): Promise<void> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT;
  const interval = options.intervalMs ?? DEFAULT_INTERVAL;
  const errorCode = options.errorCode ?? 'SEARCH_TIMEOUT';
  const deadline = nowMs() + timeout;
  for (;;) {
    assertSignal(options.signal);
    if (predicate()) return;
    if (nowMs() > deadline) {
      throw new AutomationError(errorCode, `waitForCondition timed out after ${timeout}ms`);
    }
    await sleep(interval);
  }
}

/**
 * Wait for DOM to be "idle" — no mutations for idleMs within a settling window.
 * Used after search/scroll to know when React has finished rendering.
 */
export async function waitForDomIdle(container: ParentNode = document, idleMs = 400, timeout = 5000, signal?: AbortSignal): Promise<void> {
  const deadline = nowMs() + timeout;
  let lastMutation = nowMs();
  const observer = new MutationObserver(() => {
    lastMutation = nowMs();
  });
  observer.observe(container, { childList: true, subtree: true });
  try {
    for (;;) {
      assertSignal(signal);
      if (nowMs() - lastMutation >= idleMs) return;
      if (nowMs() > deadline) return; // soft timeout — caller treats as "settle window elapsed"
      await sleep(80);
    }
  } finally {
    observer.disconnect();
  }
}

/** Walk up from an SVG icon to its enclosing button/anchor. */
export function closestButtonFromIcon(svg: Element | null): HTMLButtonElement | HTMLAnchorElement | null {
  if (!svg) return null;
  return (svg.closest('button') as HTMLButtonElement | null) ?? (svg.closest('a') as HTMLAnchorElement | null);
}

/** Find the nearest scrollable ancestor of an element. */
export function getScrollableAncestor(el: Element | null): HTMLElement | null {
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (node instanceof HTMLElement) {
      const style = getComputedStyle(node);
      const overflowY = style.overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') && node.scrollHeight > node.clientHeight) {
        return node;
      }
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Set a value on a React-controlled input using the native setter + input/change events.
 * Returns true if the value actually stuck. Retries once (focus + re-set) if React fought it.
 */
export function setNativeInputValue(input: HTMLInputElement, value: string): boolean {
  if (!input || !input.isConnected) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) return false;

  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  if (input.value !== value) {
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  return input.value === value;
}

/**
 * Click an element safely: assert connected + visible + not disabled, scroll into view,
 * re-check, then click. Never clicks a substitute when the target is invalid — recovery
 * is the caller's responsibility (IMPLEMENTATION_PLAN.md §48).
 */
export async function clickElementSafely(el: Element, signal?: AbortSignal): Promise<void> {
  assertSignal(signal);
  if (!(el instanceof HTMLElement)) {
    throw new AutomationError('DOM_CHANGED', 'clickElementSafely: not an HTMLElement');
  }
  if (!el.isConnected) throw new AutomationError('DOM_CHANGED', 'click target disconnected');
  if (el instanceof HTMLButtonElement && el.disabled) {
    throw new AutomationError('DOM_CHANGED', 'click target disabled');
  }
  if (!isVisible(el)) {
    el.scrollIntoView({ block: 'center', inline: 'center' });
    await sleep(120);
    if (!isVisible(el)) throw new AutomationError('DOM_CHANGED', 'click target not visible');
  }
  // Re-check connectedness after scroll (virtualization can recycle nodes).
  if (!el.isConnected) throw new AutomationError('DOM_CHANGED', 'click target recycled after scroll');
  el.click();
}

/** Dispatch an Escape keydown to close a modal (fallback close mechanism). */
export function pressEscape(): void {
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }),
  );
}

export function nowMs(): number {
  return Date.now();
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type { WaitOptions };
