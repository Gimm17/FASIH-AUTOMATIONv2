import type { SearchSettings } from '@shared/types';
import type { QueryCorrectionInput } from '@shared/messages';
import type { AiClient } from './ai-client';
import { normalizeName, normalizeQuery } from '@matching/normalize';
import { coreTokens } from '@matching/token-overlap';
import { levenshteinSimilarity, tokensNearEqual } from '@matching/levenshtein';

/**
 * Deterministic alternate-query builder (IMPLEMENTATION_PLAN.md §13).
 * Order: original → normalized → AI typo correction → core token.
 * All queries deduped after normalization; capped at maxQueriesPerTarget / maxAiVariants.
 */

export interface QueryVariant {
  query: string;
  reason: string;
}

/**
 * Build the candidate query list for a target. AI is only asked when enabled and the
 * target looks like it may contain a typo (otherwise deterministic queries suffice).
 */
export async function buildAlternativeQueries(
  data1: string,
  settings: SearchSettings,
  ai: AiClient | null,
  facilityType?: string,
  protectedTokens: string[] = [],
): Promise<QueryVariant[]> {
  const variants: QueryVariant[] = [];
  const seen = new Set<string>();
  const push = (q: string, reason: string) => {
    const nq = normalizeQuery(q);
    if (!nq || seen.has(nq)) return;
    seen.add(nq);
    variants.push({ query: q, reason });
  };

  // Q1 — original.
  push(data1, 'original');

  // Q2 — normalized (punctuation/whitespace normalized; meaning preserved).
  push(normalizeName(data1), 'normalized');

  // Q3 — AI typo correction (only if there are signs of a typo: two near-equal tokens).
  const looksTypo = hasTypoSignal(data1);
  if (ai && looksTypo) {
    try {
      const input: QueryCorrectionInput = {
        targetName: data1,
        facilityType,
        protectedTokens,
      };
      const correction = await ai.correctQuery(input);
      push(correction.corrected_name, `AI corrected (${correction.confidence.toFixed(2)})`);
      for (const v of correction.query_variants.slice(0, settings.maxAiVariants)) {
        push(v, 'AI variant');
      }
    } catch {
      // AI unavailable — continue with deterministic queries (never crash the job).
    }
  }

  // Local typo correction fallback (pairwise similar tokens → swap).
  for (const v of localTypoCorrections(data1)) push(v.query, v.reason);

  // Q4 — core token (the discriminative word, e.g. BONEPUSO, LABANGUN).
  for (const ct of coreTokens(data1)) {
    if (ct.length >= 3) push(ct.toUpperCase(), `core token`);
  }

  return variants.slice(0, settings.maxQueriesPerTarget);
}

/** Detect whether the name contains a likely typo: two tokens that are very similar but not equal. */
export function hasTypoSignal(data1: string): boolean {
  const tokens = normalizeName(data1).split(/[\s-]+/).filter((t) => t.length >= 4);
  for (let i = 0; i < tokens.length; i++) {
    for (let j = i + 1; j < tokens.length; j++) {
      const sim = levenshteinSimilarity(tokens[i], tokens[j]);
      if (sim >= 0.65 && sim < 1) return true;
    }
  }
  return false;
}

/**
 * Local typo correction: if the name has a hyphenated pair where one half looks like a
 * typo of the other (e.g. PONDING-PONIDNG), emit the "corrected" hyphen compound and a
 * prefix+half variant. Deterministic — used when AI is unavailable.
 */
export function localTypoCorrections(data1: string): QueryVariant[] {
  const out: QueryVariant[] = [];
  const raw = data1.trim();
  const spaceParts = raw.split(/\s+/).filter(Boolean);

  for (const part of spaceParts) {
    if (!part.includes('-')) continue;
    const halves = part.split('-').filter((h) => h.length >= 3);
    if (halves.length < 2) continue;

    // Find the most-similar half pair; pick the longer as the "correct" token.
    for (let a = 0; a < halves.length; a++) {
      for (let b = a + 1; b < halves.length; b++) {
        const sim = levenshteinSimilarity(halves[a], halves[b]);
        if (sim >= 0.65 && sim < 1) {
          const correct = halves[a].length >= halves[b].length ? halves[a] : halves[b];
          // Corrected compound: replace the typo'd half.
          const corrected = raw.split(part).join(`${correct}-${correct}`);
          if (corrected !== raw) {
            out.push({ query: corrected, reason: `local typo: ${correct}-${correct}` });
          }
          // Strip the facility prefix and try the bare corrected token.
          const bare = stripFacilityPrefix(corrected);
          if (bare && bare !== corrected) {
            out.push({ query: bare, reason: `local typo (bare): ${correct}` });
          }
          out.push({ query: correct.toUpperCase(), reason: `local token: ${correct}` });
        }
      }
    }
  }

  // Dedup.
  const seen = new Set<string>();
  return out.filter((v) => {
    const k = normalizeQuery(v.query);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const FACILITY_PREFIX_RE = /^(SDN|SD\s+NEGERI|SD|TK\s+NEGERI|TK|SMAN|SMA\s+NEGERI|SMA|SMPN|SMP|PUSKESMAS|POLINDES|POSKESDES|POSYANDU|PUSTU|KB|PAUD)\s+/i;

export function stripFacilityPrefix(name: string): string {
  return name.replace(FACILITY_PREFIX_RE, '').trim();
}

export { tokensNearEqual };
