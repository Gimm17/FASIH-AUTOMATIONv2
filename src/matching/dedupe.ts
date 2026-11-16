import type { DuplicateResult } from '@shared/types';
import { normalizeIdentityCode } from './normalize';
import { normalizeName } from './normalize';

/**
 * De-duplicate duplicate results by assignment UUID (a single candidate may surface
 * twice across multiple search queries), then deterministic sort so the output is stable.
 *
 * Sort order: normalized candidate name ASC, then normalized candidate code ASC.
 * IDs and names stay PAIRWISE aligned (IMPLEMENTATION_PLAN.md §31).
 */
export function dedupeAndSortDuplicates(duplicates: DuplicateResult[]): DuplicateResult[] {
  const seen = new Set<string>();
  const unique: DuplicateResult[] = [];
  for (const d of duplicates) {
    const key = (d.assignmentId ?? '').toLowerCase();
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(d);
  }

  return unique.sort((a, b) => {
    const na = normalizeName(a.candidateName);
    const nb = normalizeName(b.candidateName);
    if (na !== nb) return na < nb ? -1 : 1;
    const ca = normalizeIdentityCode(a.candidateCode);
    const cb = normalizeIdentityCode(b.candidateCode);
    return ca < cb ? -1 : ca > cb ? 1 : 0;
  });
}

/** Join duplicate IDs / names into Excel cell strings using the configured separator. */
export function formatDuplicateIds(duplicates: DuplicateResult[], separator = ';'): string {
  return dedupeAndSortDuplicates(duplicates)
    .map((d) => d.assignmentId)
    .join(separator);
}

export function formatDuplicateNames(duplicates: DuplicateResult[], separator = ';'): string {
  return dedupeAndSortDuplicates(duplicates)
    .map((d) => d.candidateName)
    .join(separator);
}
