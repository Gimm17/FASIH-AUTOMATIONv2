/**
 * AI service for the service worker: settings-aware client factory + IndexedDB cache.
 * The AI is only consulted for the ambiguous band (verifier gates hard guards first).
 */

import { createAiClient, browserAiTransport, type AiClient } from '@ai/ai-client';
import { adjudicateCandidate as baseAdjudicate } from '@ai/candidate-adjudicator';
import { createIdbAiCache, queryKeyFor, verdictKeyFor } from '@persistence/idb-ai-cache';
import { DEFAULT_CONFIG, STORAGE_SETTINGS_KEY } from '@shared/config';
import type { ExtensionSettings } from '@shared/types';
import type { CandidateReviewInput, QueryCorrectionInput, AiCandidateReviewResult } from '@shared/messages';
import type { SearchCandidate, TargetRow } from '@shared/types';

const cache = createIdbAiCache();

/** Load settings from chrome.storage.local merged over defaults. */
export async function loadSettings(): Promise<ExtensionSettings> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_SETTINGS_KEY)) as {
      [STORAGE_SETTINGS_KEY]?: Partial<ExtensionSettings>;
    };
    const partial = stored?.[STORAGE_SETTINGS_KEY] ?? {};
    return deepMerge(DEFAULT_CONFIG, partial);
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ fasih_settings: settings });
}

function deepMerge<T>(base: T, patch: Partial<T>): T {
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(patch ?? {})) {
    const baseValue = out[key];
    if (
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      baseValue !== null &&
      typeof baseValue === 'object' &&
      !Array.isArray(baseValue)
    ) {
      out[key] = deepMerge(baseValue as Record<string, unknown>, value as unknown as Record<string, unknown>);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

/**
 * Cached AI client (null when disabled). Query corrections and verdicts are cached by
 * normalized input + model + prompt version, so resumed jobs don't re-pay for AI calls.
 */
export async function getAiClient(settings?: ExtensionSettings): Promise<AiClient | null> {
  const s = settings ?? (await loadSettings());
  if (!s.ai.enabled) return null;
  const inner = createAiClient(s.ai, browserAiTransport);
  return {
    async health() {
      return inner.health();
    },
    async correctQuery(input: QueryCorrectionInput) {
      const key = await queryKeyFor(input.targetName, s.ai.primaryModel);
      const hit = await cache.getQueryCorrection(key);
      if (hit) return hit;
      const fresh = await inner.correctQuery(input);
      await cache.setQueryCorrection(key, fresh, s.ai.primaryModel);
      return fresh;
    },
    async adjudicate(input: CandidateReviewInput) {
      const key = await verdictKeyFor(input.target.name, input.candidate.name, s.ai.primaryModel);
      const hit = await cache.getCandidateVerdict(key);
      if (hit) return hit;
      const fresh = await inner.adjudicate(input);
      await cache.setCandidateVerdict(key, fresh, s.ai.primaryModel);
      return fresh;
    },
  };
}

/** Cached adjudication wrapper — degrades to 'uncertain' (manual review) on any failure. */
export async function adjudicateCandidate(
  target: Pick<TargetRow, 'data1'>,
  candidate: SearchCandidate,
  ai: AiClient | null,
): Promise<AiCandidateReviewResult> {
  return baseAdjudicate(target, candidate, ai);
}
