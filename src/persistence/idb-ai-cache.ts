/**
 * IndexedDB-backed AI cache with an in-memory fast tier (IMPLEMENTATION_PLAN.md §25).
 * Survives service-worker restarts; the memory tier keeps hot verdicts instant.
 * Never stores credentials — keys are sha256 of normalized inputs + model + prompt version.
 */

import { createInMemoryAiCache, queryCorrectionCacheKey, candidateVerdictCacheKey, type AiCache } from './ai-cache';
import { aiCacheStore } from './db';
import { normalizeName } from '@matching/normalize';
import { PROMPT_VERSION } from '@shared/constants';

export function createIdbAiCache(): AiCache {
  const memory = createInMemoryAiCache();

  return {
    async getQueryCorrection(key) {
      const hot = await memory.getQueryCorrection(key);
      if (hot) return hot;
      const rec = await aiCacheStore.getQueryCorrection(key);
      return rec?.response ?? null;
    },

    async setQueryCorrection(key, response, model) {
      await memory.setQueryCorrection(key, response, model);
      await aiCacheStore
        .put({ key, response, model, promptVersion: PROMPT_VERSION, timestamp: new Date().toISOString() })
        .catch(() => {
          /* cache write failure is non-fatal */
        });
    },

    async getCandidateVerdict(key) {
      const hot = await memory.getCandidateVerdict(key);
      if (hot) return hot;
      const rec = await aiCacheStore.getCandidateVerdict(key);
      return rec?.response ?? null;
    },

    async setCandidateVerdict(key, response, model) {
      await memory.setCandidateVerdict(key, response, model);
      await aiCacheStore
        .put({ key, response, model, promptVersion: PROMPT_VERSION, timestamp: new Date().toISOString() })
        .catch(() => {
          /* cache write failure is non-fatal */
        });
    },

    async clear() {
      await memory.clear();
      await aiCacheStore.clear();
    },
  };
}

/** Convenience: build the query-correction cache key from raw inputs. */
export function queryKeyFor(targetName: string, model: string): Promise<string> {
  return queryCorrectionCacheKey(normalizeName(targetName), model);
}

/** Convenience: build the candidate-verdict cache key from raw inputs. */
export function verdictKeyFor(targetName: string, candidateName: string, model: string): Promise<string> {
  return candidateVerdictCacheKey(normalizeName(targetName), normalizeName(candidateName), model);
}
