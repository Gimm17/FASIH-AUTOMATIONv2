/**
 * Pure UUID utilities (no DOM / chrome APIs) so they're trivially unit-testable.
 *
 * Assignment href format observed on FASIH:
 *   https://fasih-sm.bps.go.id/app/assignment/{surveyPeriodId}/{assignmentId}
 * where both segments are UUIDs and the assignment UUID is the LAST one in the path.
 */

export const UUID_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i;

/** Looser fallback that accepts any 8-4-4-4-12 hex shape (non-strict version bits). */
export const UUID_LOOSE_REGEX =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export function isUuid(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * Extract the assignment UUID from a FASIH Review / assignment href.
 * Priority:
 *   1. Route segment after the last "/assignment/" path segment (2 segments: period + id).
 *   2. The LAST UUID token in the URL (period UUID comes first).
 *   3. The only UUID if exactly one is present.
 * Returns '' when no valid UUID is found — callers must NOT fabricate one.
 */
export function extractAssignmentUuid(href: string | null | undefined): string {
  if (!href) return '';
  const url = String(href).trim();
  if (!url) return '';

  // Strip query/fragment so a UUID-in-query doesn't shadow the path UUID.
  const pathOnly = url.split('?')[0]?.split('#')[0] ?? url;

  // 1. Known route: .../assignment/{periodId}/{assignmentId}
  const assignIdx = pathOnly.toLowerCase().indexOf('/assignment/');
  if (assignIdx !== -1) {
    const tail = pathOnly.slice(assignIdx + '/assignment/'.length);
    const segments = tail.split('/').filter((s) => s.length > 0);
    // segments[0] = surveyPeriodId, segments[1] = assignmentId
    const candidate = segments.length >= 2 ? segments[1] : segments[0];
    if (isUuid(candidate)) return candidate.toLowerCase();
  }

  // 2. Last UUID in the path; if multiple, the trailing one is the assignment id.
  const matches = pathOnly.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi);
  if (matches && matches.length >= 1) {
    return matches[matches.length - 1].toLowerCase();
  }

  // 3. Whole-URL fallback (rare — e.g. data attribute holding a bare UUID).
  const loose = url.match(UUID_LOOSE_REGEX);
  return loose ? loose[0].toLowerCase() : '';
}

/** True when two UUID strings refer to the same assignment (case-insensitive). */
export function isSameAssignmentId(a: string | undefined, b: string | undefined): boolean {
  const na = (a ?? '').trim().toLowerCase();
  const nb = (b ?? '').trim().toLowerCase();
  return na.length > 0 && na === nb;
}
