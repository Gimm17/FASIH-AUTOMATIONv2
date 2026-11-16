import type { FacilityType } from '@shared/constants';
import { normalizeName } from './normalize';

/**
 * Local facility-type classifier (IMPLEMENTATION_PLAN.md §16).
 * Two known-but-different facility types are a HARD reject, even when the location name matches.
 * UNKNOWN (one or both) does not reject — it raises strictness / AI review.
 */

interface FacilityRule {
  type: FacilityType;
  // keywords matched as whole-word-ish tokens against the normalized name.
  keywords: string[];
}

const FACILITY_RULES: FacilityRule[] = [
  { type: 'EDU_SD', keywords: ['SD NEGERI', 'SDN', 'SD', 'SEKOLAH DASAR'] },
  { type: 'EDU_SMP', keywords: ['SMP NEGERI', 'SMPN', 'SMP', 'SLTP'] },
  { type: 'EDU_SMA', keywords: ['SMA NEGERI', 'SMAN', 'SMA', 'SLTA'] },
  { type: 'EDU_SMK', keywords: ['SMK NEGERI', 'SMKN', 'SMK'] },
  { type: 'EDU_TK', keywords: ['TK NEGERI', 'TK'] },
  { type: 'EDU_KB', keywords: ['KB'] },
  { type: 'EDU_PAUD', keywords: ['PAUD', 'SPS'] },
  { type: 'HEALTH_PUSKESMAS', keywords: ['PUSKESMAS'] },
  { type: 'HEALTH_PUSTU', keywords: ['PUSTU'] },
  { type: 'HEALTH_POLINDES', keywords: ['POLINDES'] },
  { type: 'HEALTH_POSKESDES', keywords: ['POSKESDES'] },
  { type: 'HEALTH_POSYANDU', keywords: ['POSYANDU'] },
  { type: 'MARKET', keywords: ['PASAR'] },
  { type: 'GOVERNMENT', keywords: ['KANTOR', 'BALAI', 'UPT'] },
  { type: 'OTHER', keywords: ['RUMAH', 'DTSEN', 'DUSUN'] },
];

/**
 * Detect the facility type of an entity name. Returns UNKNOWN when no keyword matches.
 * Short tokens (≤2 chars, e.g. "TK", "KB") are matched as whole words only, so "TK"
 * doesn't fire inside "TOKO".
 */
export function detectFacilityType(name: string | null | undefined): FacilityType {
  const norm = normalizeName(name);
  if (!norm) return 'UNKNOWN';

  const tokens = norm.split(/\s+/);

  for (const rule of FACILITY_RULES) {
    for (const kw of rule.keywords) {
      const kwUp = kw.toUpperCase();
      // Multi-word keyword (e.g. "SD NEGERI") — substring match on normalized name.
      if (kwUp.includes(' ')) {
        if (norm.includes(kwUp)) return rule.type;
        continue;
      }
      // Short keyword — must be a whole token, optionally followed by a digit
      // (e.g. "SD" in "SD 1" or "SD1").
      if (kwUp.length <= 3) {
        const idx = tokens.indexOf(kwUp);
        if (idx !== -1) return rule.type;
        // token like "SD1" → strip trailing digits and compare
        const hit = tokens.some((t) => t.replace(/[0-9]+$/, '') === kwUp && t.length >= kwUp.length);
        if (hit) return rule.type;
      } else {
        if (tokens.includes(kwUp)) return rule.type;
      }
    }
  }
  return 'UNKNOWN';
}

/**
 * Hard facility mismatch: both known, both non-UNKNOWN, and different.
 * POLINDES vs POSKESDES are intentionally treated as DIFFERENT (per plan: only the
 * exact facility type matches; POLINDES/POSKESDES/POSYANDU are separate health posts).
 * SMA vs SMK are likewise separate school levels (vokasional ≠ umum).
 */
export function isHardFacilityMismatch(a: FacilityType, b: FacilityType): boolean {
  if (a === 'UNKNOWN' || b === 'UNKNOWN') return false;
  return a !== b;
}

/** Two facilities are compatible when neither is unknown-and-the-other-known mismatched. */
export function facilitiesCompatible(a: FacilityType, b: FacilityType): boolean {
  return !isHardFacilityMismatch(a, b);
}
