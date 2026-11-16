import { FASIH_SELECTORS } from './selectors';
import { collectRenderedCards } from './card-parser';
import { getScrollableAncestor, waitForDomIdle, sleep, nowMs, assertSignal } from './dom-utils';
import type { ParsedCard } from './site-types';
import type { ScrollSettings } from '@shared/types';
import { normalizeIdentityCode } from '@matching/normalize';

/**
 * Virtualized-list auto-scroll engine (IMPLEMENTATION_PLAN.md §12).
 *
 * FASIH renders only the visible slice of cards; off-screen items are unrendered and
 * DOM nodes may be recycled. We scroll in steps, collecting cards into a Map keyed by
 * NORMALIZED card code (primitives only — never persistent DOM refs).
 *
 * Stop conditions (reported honestly via stoppedBy):
 *   A. reached bottom (scrollTop + clientHeight >= scrollHeight − tolerance)
 *   B. no new candidate codes for N consecutive passes
 *   C. maxPasses reached (stopped EARLY — reachedBottom stays false)
 *   D. signal aborted (pause/stop)
 */

export type ScrollStopReason = 'bottom' | 'no_new_candidates' | 'max_passes' | 'no_container';

export interface ScrollResult {
  candidates: ParsedCard[];
  scrollPasses: number;
  /** True ONLY when the list was actually scrolled to its end. */
  reachedBottom: boolean;
  /** Why collection stopped — lets the caller distinguish "list exhausted" from "stopped early". */
  stoppedBy: ScrollStopReason;
}

export async function collectAllVirtualizedCards(
  sourceQuery: string,
  settings: ScrollSettings,
  signal?: AbortSignal,
): Promise<ScrollResult> {
  const pool = new Map<string, ParsedCard>();

  // Find the scroll container: the scrollable ancestor of any assignment card.
  const sampleCard = document.querySelector<HTMLElement>(FASIH_SELECTORS.assignmentCards[0]);
  let container = getScrollableAncestor(sampleCard);
  if (!container) {
    // Fallback: any scrollable div on the page.
    container =
      Array.from(document.querySelectorAll<HTMLElement>('div')).find((el) => {
        const s = getComputedStyle(el);
        return (
          (s.overflowY === 'auto' || s.overflowY === 'scroll') &&
          el.scrollHeight > el.clientHeight
        );
      }) ?? null;
  }

  // If there is no scroll container, just collect what's rendered once.
  if (!container) {
    mergeInto(pool, collectRenderedCards(sourceQuery));
    return { candidates: Array.from(pool.values()), scrollPasses: 0, reachedBottom: true, stoppedBy: 'no_container' };
  }

  // Scroll to top first.
  container.scrollTop = 0;
  await waitForDomIdle(container, settings.settleTimeoutMs, settings.settleTimeoutMs, signal);
  mergeInto(pool, collectRenderedCards(sourceQuery));

  let noNewRounds = 0;
  let reachedBottom = false;
  let stoppedBy: ScrollStopReason = 'max_passes';
  let pass = 0;

  for (; pass < settings.maxPasses; pass++) {
    assertSignal(signal);

    const before = pool.size;
    mergeInto(pool, collectRenderedCards(sourceQuery));
    const gained = pool.size - before;

    // Stop condition B: no new candidates for N rounds.
    if (gained === 0) {
      noNewRounds++;
      if (noNewRounds >= settings.noNewCandidateRoundsToStop) {
        stoppedBy = 'no_new_candidates';
        break;
      }
    } else {
      noNewRounds = 0;
    }

    // Scroll down by stepRatio * viewport height.
    const prevTop = container.scrollTop;
    container.scrollTop += Math.max(1, container.clientHeight * settings.stepRatio);
    await waitForDomIdle(container, settings.settleTimeoutMs, settings.settleTimeoutMs, signal);
    await sleep(120);

    // Stop condition A: reached bottom.
    if (container.scrollTop <= prevTop + 1 && container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
      reachedBottom = true;
      stoppedBy = 'bottom';
      // one last collection pass at the bottom.
      mergeInto(pool, collectRenderedCards(sourceQuery));
      break;
    }
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 4) {
      reachedBottom = true;
      stoppedBy = 'bottom';
      mergeInto(pool, collectRenderedCards(sourceQuery));
      break;
    }
  }

  // Loop exited because pass hit maxPasses without reaching the bottom → stoppedBy stays
  // 'max_passes' and reachedBottom stays false (caller can warn about missed candidates).

  return {
    candidates: Array.from(pool.values()),
    scrollPasses: pass + 1,
    reachedBottom,
    stoppedBy,
  };
}

/** Merge a fresh collection pass into the persistent pool (dedupe by normalized code). */
function mergeInto(pool: Map<string, ParsedCard>, fresh: Map<string, ParsedCard>): void {
  for (const [key, card] of fresh) {
    const existing = pool.get(key);
    if (!existing || (!existing.cardName && card.cardName)) {
      pool.set(key, card);
    }
  }
}

/** Wait helper exposed for tests that simulate incremental rendering. */
export async function settle(container: HTMLElement, ms: number, signal?: AbortSignal): Promise<void> {
  await waitForDomIdle(container, ms, ms * 2, signal);
}

export { normalizeIdentityCode, nowMs };
