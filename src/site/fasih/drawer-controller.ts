import { FASIH_SELECTORS, findFirstMatchingSelector } from './selectors';
import {
  waitForElement,
  waitForCondition,
  waitForElementGoneOrHidden,
  clickElementSafely,
  pressEscape,
  isVisible,
  closestButtonFromIcon,
  waitForDomIdle,
  sleep,
  assertSignal,
} from './dom-utils';
import { normalizeIdentityCode } from '@matching/normalize';
import { readReviewLink, type ReviewLink } from './review-link';
import { AutomationError } from '@core/errors';
import type { WaitOptions } from './site-types';
import type { ScrollSettings } from '@shared/types';

/**
 * Detail-drawer controller (IMPLEMENTATION_PLAN.md §11.1.3, §11.1.6, §30).
 *
 * Sniper extraction: for an accepted candidate we RE-SEARCH its exact code, find the
 * EXACT card (never the first one), click it, wait for the drawer, READ the review href
 * (never click Review), extract the UUID, then close + verify gone.
 *
 * We never store a card DOM reference from a previous scroll pass — virtualization may
 * have recycled it. We re-resolve by exact code.
 */

export interface DrawerExtractionResult {
  reviewLink: ReviewLink;
  drawer: HTMLElement;
}

/** Resolve the currently-open drawer/modal root. */
export async function resolveDrawer(options: WaitOptions = {}): Promise<HTMLElement> {
  const el = await waitForElement<HTMLElement>(FASIH_SELECTORS.drawer, {
    ...options,
    errorCode: options.errorCode ?? 'DRAWER_NOT_FOUND',
  });
  if (!isVisible(el)) {
    await waitForCondition(() => isVisible(el), { ...options, timeoutMs: options.timeoutMs ?? 5000 });
  }
  return el;
}

/** Find the card whose normalized code EXACTLY matches the expected candidate code. */
export function findExactCardByCode(expectedCode: string): HTMLElement | null {
  const norm = normalizeIdentityCode(expectedCode);
  if (!norm) return null;
  const cards = Array.from(
    document.querySelectorAll<HTMLElement>(FASIH_SELECTORS.assignmentCards[0]),
  );
  // Match by data-tsd-source suffix first (exact).
  for (const card of cards) {
    const src = card.getAttribute('data-tsd-source') ?? '';
    const suffix = src.startsWith('assignment-list-item-')
      ? src.slice('assignment-list-item-'.length)
      : '';
    if (suffix && normalizeIdentityCode(suffix) === norm) return card;
  }
  // Fallback: scan card text for the code.
  for (const card of cards) {
    const text = (card.innerText ?? '').toUpperCase();
    if (text.includes(norm.toUpperCase())) return card;
  }
  return null;
}

/** Resolve the detail trigger INSIDE a specific card (never the first card on the page). */
export function resolveDetailTrigger(card: HTMLElement): HTMLElement | null {
  for (const sel of FASIH_SELECTORS.candidateDetailTrigger) {
    try {
      const el = card.querySelector<HTMLElement>(sel);
      if (el && isVisible(el)) return el;
    } catch {
      // skip
    }
  }
  // Fallback: descendant anchor/button whose text contains the exact code.
  const norm = normalizeIdentityCode(card.getAttribute('data-tsd-source')?.slice('assignment-list-item-'.length) ?? '');
  const candidates = Array.from(card.querySelectorAll<HTMLElement>('a, button'));
  for (const el of candidates) {
    if (isVisible(el) && norm && (el.textContent ?? '').toUpperCase().includes(norm.toUpperCase())) {
      return el;
    }
  }
  return null;
}

/**
 * Open the detail drawer for an EXACT candidate code and READ the review link.
 * Returns the review link + the drawer element (caller closes it).
 */
export async function openExactCardAndReadReview(
  expectedCode: string,
  scrollSettings: ScrollSettings,
  options: WaitOptions = {},
): Promise<DrawerExtractionResult> {
  assertSignal(options.signal);

  const card = findExactCardByCode(expectedCode);
  if (!card || !card.isConnected) {
    throw new AutomationError('EXACT_CARD_NOT_FOUND', `exact card not found for code ${expectedCode}`);
  }

  const trigger = resolveDetailTrigger(card);
  if (!trigger) {
    throw new AutomationError('CARD_PARSE_FAILED', `detail trigger not found in card ${expectedCode}`);
  }

  // Click the trigger to open the drawer in place (prevent <a> navigation handled in clickElementSafely).
  await clickElementSafely(preventNavigation(trigger), options.signal);

  // Wait for the drawer to appear + settle (settle window scales with scroll settings).
  const drawer = await resolveDrawer({ ...options, timeoutMs: options.timeoutMs ?? 8000 });
  const settleWindow = Math.max(6000, scrollSettings.settleTimeoutMs * 2);
  await waitForDomIdle(drawer, 500, settleWindow, options.signal);

  // READ the review link (never click Review).
  const reviewLink = await readReviewLink(drawer);
  return { reviewLink, drawer };
}

/** Close the drawer and VERIFY it is gone before continuing (never start the next candidate early). */
export async function closeDrawer(drawer: HTMLElement, options: WaitOptions = {}): Promise<void> {
  assertSignal(options.signal);

  const closeButton = findDrawerCloseButton(drawer);
  if (closeButton) {
    try {
      await clickElementSafely(closeButton, options.signal);
    } catch {
      // fall through to Escape
    }
  }

  // Verify gone / hidden.
  try {
    await waitForElementGoneOrHidden(drawer, { ...options, timeoutMs: options.timeoutMs ?? 5000 });
    return;
  } catch {
    // Retry with Escape once.
    pressEscape();
    await sleep(200);
    if (!drawer.isConnected || !isVisible(drawer)) return;
    throw new AutomationError('DRAWER_CLOSE_FAILED', 'drawer remained open after close + Escape');
  }
}

/** Resolve the close button inside the drawer scope. */
export function findDrawerCloseButton(drawer: HTMLElement): HTMLButtonElement | null {
  // Semantic close buttons first.
  for (const sel of FASIH_SELECTORS.closeButton) {
    try {
      const el = drawer.querySelector<HTMLButtonElement>(sel);
      if (el instanceof HTMLButtonElement && isVisible(el) && !el.disabled) return el;
    } catch {
      // skip invalid selector
    }
  }
  // Icon fallback: svg.tabler-icon-x → closest button.
  const icon = findFirstMatchingSelector<SVGElement>(FASIH_SELECTORS.closeIcon, drawer);
  if (icon) {
    const btn = closestButtonFromIcon(icon);
    if (btn instanceof HTMLButtonElement && isVisible(btn) && !btn.disabled) return btn;
  }
  return null;
}

/** Stop an <a> from navigating while still letting its click handler open the modal. */
function preventNavigation(trigger: HTMLElement): HTMLElement {
  if (trigger instanceof HTMLAnchorElement) {
    trigger.addEventListener('click', (e) => e.preventDefault(), { once: true, capture: true });
  }
  return trigger;
}
