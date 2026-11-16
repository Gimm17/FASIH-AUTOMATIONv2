/**
 * FASIH content script entry (IMPLEMENTATION_PLAN.md §4.1).
 *
 * A thin command router: the service worker's job engine sends ContentCommand messages
 * and this script drives the FASIH DOM via the site controllers. All DOM logic lives in
 * src/site/fasih/* — this file only routes.
 *
 * Guarantees:
 *   - every handler returns a CommandResult envelope (errors never cross the channel raw);
 *   - the Review button is NEVER clicked — links are only read (review-link.ts);
 *   - responses are JSON-serializable primitives only.
 */

import {
  FASIH_SELECTORS,
  findFirstMatchingSelector,
} from '@site/selectors';
import {
  runSearch,
} from '@site/search-controller';
import { collectAllVirtualizedCards } from '@site/virtual-scroll';
import {
  openExactCardAndReadReview,
  closeDrawer as closeDrawerController,
  resolveDrawer,
} from '@site/drawer-controller';
import { readReviewLink } from '@site/review-link';
import { clickElementSafely, closestButtonFromIcon, sleep, waitForElement } from '@site/dom-utils';
import { AutomationError, normalizeError } from '@core/errors';
import { DEFAULT_CONFIG } from '@shared/config';
import type { ContentCommand } from '@shared/messages';
import type { CollectCardsResult, PingResult, LoginCheckResult, ListViewResult, ReadReviewLinkResult } from '@shared/messages';

const RENDER_FLAG = '__fasihDuplicateAutomationLoaded';

function isLoaded(): boolean {
  return (window as unknown as Record<string, boolean>)[RENDER_FLAG] === true;
}

/** The drawer of the most recent FASIH_OPEN_CARD — kept only transiently, never persisted. */
let activeDrawer: HTMLElement | null = null;

async function ping(): Promise<PingResult> {
  return { ok: true, isRunning: true, url: location.href };
}

async function detectLogin(): Promise<LoginCheckResult> {
  const loginForm =
    document.querySelector('input[type="password"]') !== null ||
    /login|signin|masuk/i.test(location.pathname + location.search);
  return { loginRequired: loginForm, url: location.href };
}

function hasListView(): boolean {
  return !!findFirstMatchingSelector(FASIH_SELECTORS.assignmentCards, document);
}

async function ensureListView(): Promise<ListViewResult> {
  if (hasListView()) return { listView: true, switched: false };

  // Resolve the toggle: labeled button first, then the list icon → closest button.
  let toggle: HTMLElement | null = findFirstMatchingSelector<HTMLElement>(FASIH_SELECTORS.listViewToggle, document);
  if (!toggle) {
    const icon = findFirstMatchingSelector<SVGElement>(FASIH_SELECTORS.listViewIcon, document);
    toggle = closestButtonFromIcon(icon);
  }
  if (!toggle) {
    throw new AutomationError('LIST_VIEW_TOGGLE_NOT_FOUND', 'list view toggle not found on the page');
  }

  await clickElementSafely(toggle);
  await waitForElement(FASIH_SELECTORS.assignmentCards, { timeoutMs: 10000 });
  if (!hasListView()) {
    throw new AutomationError('LIST_VIEW_SWITCH_FAILED', 'list view did not activate after toggle click');
  }
  return { listView: true, switched: true };
}

async function search(query: string): Promise<{ applied: true }> {
  await runSearch(query);
  return { applied: true };
}

async function collectCards(): Promise<CollectCardsResult> {
  // Reset any stale drawer before scrolling the list.
  if (activeDrawer?.isConnected) {
    await closeDrawerController(activeDrawer).catch(() => {});
    activeDrawer = null;
  }
  const result = await collectAllVirtualizedCards('', DEFAULT_CONFIG.scroll);
  return {
    candidates: result.candidates.map((c) => ({
      sourceQuery: c.sourceQuery,
      cardName: c.cardName,
      cardCode: c.cardCode,
      rawText: c.rawText,
      metadata: c.metadata,
    })),
    scrollPasses: result.scrollPasses,
    reachedBottom: result.reachedBottom,
    stoppedBy: result.stoppedBy,
  };
}

async function openCard(cardCode: string): Promise<ReadReviewLinkResult> {
  const { reviewLink, drawer } = await openExactCardAndReadReview(cardCode, DEFAULT_CONFIG.scroll, {
    timeoutMs: 8000,
  });
  activeDrawer = drawer;
  return { href: reviewLink.href, assignmentId: reviewLink.assignmentId };
}

async function readReviewLinkFromOpenDrawer(): Promise<ReadReviewLinkResult> {
  const drawer = activeDrawer?.isConnected
    ? activeDrawer
    : await resolveDrawer({ timeoutMs: 4000 });
  const link = await readReviewLink(drawer);
  return { href: link.href, assignmentId: link.assignmentId };
}

async function closeActiveDrawer(): Promise<{ closed: true }> {
  const drawer = activeDrawer?.isConnected ? activeDrawer : null;
  if (drawer) {
    await closeDrawerController(drawer);
    activeDrawer = null;
  } else {
    // Best-effort: close any open drawer/modal found on the page.
    const anyDrawer = findFirstMatchingSelector<HTMLElement>(FASIH_SELECTORS.drawer, document);
    if (anyDrawer) await closeDrawerController(anyDrawer);
  }
  await sleep(100);
  return { closed: true };
}

async function handle(command: ContentCommand): Promise<unknown> {
  switch (command.type) {
    case 'FASIH_PING':
      return ping();
    case 'FASIH_DETECT_LOGIN':
      return detectLogin();
    case 'FASIH_HAS_LIST_VIEW':
      return { listView: hasListView(), switched: false } satisfies ListViewResult;
    case 'FASIH_ENSURE_LIST_VIEW':
      return ensureListView();
    case 'FASIH_SEARCH':
      return search(command.query);
    case 'FASIH_COLLECT_CARDS':
      return collectCards();
    case 'FASIH_OPEN_CARD':
      return openCard(command.cardCode);
    case 'FASIH_READ_REVIEW_LINK':
      return readReviewLinkFromOpenDrawer();
    case 'FASIH_CLOSE_DRAWER':
      return closeActiveDrawer();
    default:
      throw new AutomationError('DOM_CHANGED', `unknown content command: ${(command as { type: string }).type}`);
  }
}

function bootstrap(): void {
  if (isLoaded()) return; // guard against double injection
  (window as unknown as Record<string, boolean>)[RENDER_FLAG] = true;

  chrome.runtime.onMessage.addListener((command: ContentCommand, _sender, sendResponse) => {
    handle(command)
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err: unknown) => {
        const automationErr = normalizeError(err);
        sendResponse({ ok: false, code: automationErr.code, message: automationErr.message });
      });
    return true; // keep the channel open for the async handler
  });
}

bootstrap();

// Expose a tiny escape hatch so the service worker can detect injection without a round-trip.
export {};
