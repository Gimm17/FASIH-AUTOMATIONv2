import { FASIH_SELECTORS, findAllMatchingSelectors } from './selectors';
import { isVisible, isUsableButton } from './dom-utils';
import { extractAssignmentUuid } from '@shared/uuid';
import { AutomationError } from '@core/errors';
import { FASIH_SEARCH_PATH_PREFIX } from '@shared/constants';

/**
 * Read-only Review/assignment link extraction (IMPLEMENTATION_PLAN.md §21, §22, §28).
 *
 * ABSOLUTE RULE: NEVER click the Review button, NEVER navigate, NEVER window.open.
 * We only READ:
 *   1. anchor.href with data-tsd-source*="assignment-action-review"
 *   2. any anchor[href*="/app/assignment/"] INSIDE the drawer scope
 *   3. read-only React fiber props (__reactProps$) carrying href/to/url/assignmentId
 *
 * Broad `a[href*="/assignment/"]` alone is NOT accepted — it must be inside the drawer
 * AND satisfy one of: data-tsd-source review marker, text "Review", or href ending /review,
 * OR be an /app/assignment/ route anchor (which on FASIH is the assignment detail route).
 */

export interface ReviewLink {
  href: string;
  assignmentId: string;
}

/**
 * Resolve a valid Review anchor inside the drawer scope and READ its href.
 * Throws typed errors on failure (never fabricates a UUID).
 */
export async function readReviewLink(drawer: HTMLElement): Promise<ReviewLink> {
  const anchor = resolveReviewAnchor(drawer);
  if (!anchor) {
    throw new AutomationError('REVIEW_ACTION_NOT_FOUND', 'no valid review anchor inside drawer');
  }
  const href = readAnchorHref(anchor);
  if (!href) {
    throw new AutomationError('REVIEW_HREF_MISSING', 'review anchor has no href');
  }
  const assignmentId = extractAssignmentUuid(href);
  if (!assignmentId) {
    throw new AutomationError('ASSIGNMENT_UUID_NOT_FOUND', `no UUID in href: ${href}`);
  }
  if (!href.toLowerCase().includes(FASIH_SEARCH_PATH_PREFIX.toLowerCase())) {
    throw new AutomationError('INVALID_REVIEW_HREF', `href is not an assignment route: ${href}`);
  }
  return { href, assignmentId };
}

/**
 * Find a valid review anchor inside the drawer scope.
 * Tries: data-tsd-source markers → /app/assignment/ anchors → review-text/icon fallback.
 */
export function resolveReviewAnchor(drawer: HTMLElement): HTMLAnchorElement | null {
  // 1. data-tsd-source markers (semantic, most stable).
  for (const sel of FASIH_SELECTORS.reviewAction.slice(0, 3)) {
    try {
      const el = drawer.querySelector<HTMLAnchorElement>(sel);
      if (el && isValidReviewAnchor(el, drawer)) return el;
    } catch {
      // skip
    }
  }
  // 2. Any /app/assignment/ anchor inside the drawer (FASIH detail route).
  const assignAnchors = findAllMatchingSelectors<HTMLAnchorElement>(
    ['a[href*="/app/assignment/"]'],
    drawer,
  );
  for (const a of assignAnchors) {
    if (isValidReviewAnchor(a, drawer)) return a;
  }
  // 3. /assignment/.../review anchors (plan's schematic route).
  const reviewRoute = findAllMatchingSelectors<HTMLAnchorElement>(
    ['a[href*="/assignment/"][href*="/review"]'],
    drawer,
  );
  for (const a of reviewRoute) {
    if (isValidReviewAnchor(a, drawer)) return a;
  }
  // 4. Icon-based fallback (telegram icon) → closest anchor + Review predicate.
  const icons = findAllMatchingSelectors<SVGElement>(FASIH_SELECTORS.reviewIcon, drawer);
  for (const svg of icons) {
    const anchor = svg.closest('a') as HTMLAnchorElement | null;
    if (anchor && isValidReviewAnchor(anchor, drawer)) return anchor;
  }
  return null;
}

/**
 * Validate that an element is a legitimate Review anchor inside the drawer.
 * (IMPLEMENTATION_PLAN.md §22 / §11.1.7.)
 *
 * The loose "any /assignment/ anchor" acceptance is constrained: an unmarked assignment
 * route anchor only qualifies when it points at the two-UUID detail route
 * (/app/assignment/{periodId}/{assignmentId}) — a bare link to some other assignment
 * list route is NOT accepted, so we never read the wrong UUID.
 */
export function isValidReviewAnchor(el: Element, drawer: Element): el is HTMLAnchorElement {
  if (!(el instanceof HTMLAnchorElement)) return false;
  if (!drawer.contains(el)) return false;
  if (!el.href) return false;
  if (!isVisible(el)) return false;

  const source = (el.getAttribute('data-tsd-source') ?? '').toLowerCase();
  const text = (el.textContent ?? '').trim().toLowerCase();
  const href = el.href.toLowerCase();

  const semanticallyReview =
    source.includes('assignment-action-review') ||
    text.includes('review') ||
    href.includes('/review');

  // Two-UUID assignment detail route: /app/assignment/{uuid}/{uuid}
  const isAssignmentDetailRoute = /\/app\/assignment\/[0-9a-f-]{36}\/[0-9a-f-]{36}/.test(href);
  return semanticallyReview || isAssignmentDetailRoute;
}

/** Read an anchor's href — direct, via data-attrs, or via read-only React fiber props. */
export function readAnchorHref(anchor: HTMLAnchorElement): string {
  // 1. Direct href (property, resolves relative URLs against the document base).
  if (anchor.href && anchor.href.includes('/assignment/')) return anchor.href;
  // 2. data- attributes.
  for (const attr of ['data-href', 'data-url', 'data-link', 'data-to'] as const) {
    const val = anchor.getAttribute(attr);
    if (val && val.includes('/assignment/')) return absolutize(val);
  }
  // 3. Read-only React fiber props (NEVER writes to the component).
  const fiberProps = readReactProps(anchor);
  if (fiberProps) {
    for (const key of ['href', 'to', 'url'] as const) {
      const v = (fiberProps as Record<string, unknown>)[key];
      if (typeof v === 'string' && v.includes('/assignment/')) return absolutize(v);
    }
    const aid = (fiberProps as Record<string, unknown>).assignmentId;
    if (typeof aid === 'string' && aid) return `${location.origin}${FASIH_SEARCH_PATH_PREFIX}/${aid}`;
    const nested = (fiberProps as Record<string, unknown>).assignment;
    if (nested && typeof nested === 'object') {
      const id = (nested as Record<string, unknown>).id;
      if (typeof id === 'string' && id) return `${location.origin}${FASIH_SEARCH_PATH_PREFIX}/${id}`;
    }
  }
  return anchor.href ?? '';
}

/** Read React fiber props from a DOM element WITHOUT mutating it. */
export function readReactProps(el: Element): Record<string, unknown> | null {
  const own = el as Element & Record<string, unknown>;
  const propKey = Object.keys(own).find((k) => k.startsWith('__reactProps$'));
  if (propKey) {
    const props = own[propKey];
    if (props && typeof props === 'object') return props as Record<string, unknown>;
  }
  const fiberKey = Object.keys(own).find(
    (k) => k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$'),
  );
  if (fiberKey) {
    const fiber = own[fiberKey] as
      | { memoizedProps?: unknown; pendingProps?: unknown; return?: { memoizedProps?: unknown } }
      | null;
    if (!fiber) return null;
    const candidates = [fiber.memoizedProps, fiber.pendingProps, fiber.return?.memoizedProps];
    for (const p of candidates) {
      if (p && typeof p === 'object') return p as Record<string, unknown>;
    }
  }
  return null;
}

function absolutize(href: string): string {
  if (/^https?:\/\//i.test(href)) return href;
  if (href.startsWith('//')) return `${location.protocol}${href}`;
  if (href.startsWith('/')) return `${location.origin}${href}`;
  return `${location.origin}/${href.replace(/^\.?\//, '')}`;
}

/** Convenience: extract just the UUID from a resolved anchor (for tests). */
export function reviewAnchorAssignmentId(anchor: HTMLAnchorElement): string {
  return extractAssignmentUuid(readAnchorHref(anchor));
}

/** Mark a button as non-interactive by accident — used only to assert we never click Review. */
export function assertReviewButtonNeverClicked(el: Element): void {
  if (isUsableButton(el)) {
    // Intentionally a no-op assertion: this is a guardrail hook. Real protection is that
    // readReviewLink() never calls clickElementSafely() on the review element.
  }
}
