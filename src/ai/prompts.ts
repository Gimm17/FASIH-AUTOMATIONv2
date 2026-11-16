import type { QueryCorrectionInput, CandidateReviewInput } from '@shared/messages';
import { PROMPT_VERSION } from '@shared/constants';

/**
 * Prompt construction for the two AI tasks. Keeps prompts SHORT (entity matching only).
 * The AI only ever sees the minimum strings required (names + token lists + local scores).
 * No Excel rows, no credentials, no FASIH data are sent.
 */

export function buildQueryCorrectionPrompt(input: QueryCorrectionInput): {
  system: string;
  user: string;
  promptVersion: string;
} {
  const system = [
    'Anda membantu mengoreksi typo nama fasilitas/entitas Indonesia untuk kebutuhan pencarian.',
    'Jangan mengarang lokasi atau nama baru.',
    'Pertahankan tipe fasilitas, nomor, dan penanda arah.',
    'Keluarkan JSON saja dengan skema: {"corrected_name": string, "query_variants": string[<=2], "confidence": number}.',
  ].join('\n');

  const user = JSON.stringify({
    target_name: input.targetName,
    facility_type: input.facilityType ?? null,
    protected_tokens: input.protectedTokens,
  });

  return { system, user, promptVersion: PROMPT_VERSION };
}

export function buildCandidateAdjudicationPrompt(input: CandidateReviewInput): {
  system: string;
  user: string;
  promptVersion: string;
} {
  const system = [
    'Anda memverifikasi apakah dua nama fasilitas/entitas Indonesia merujuk entitas yang SAMA.',
    'Kriteria SAMA: bangunan/fasilitas/sekolah/usaha yang sama atau variasi typo nama.',
    'Kriteria BEDA: jenis fasilitas berbeda, atau wilayah/arah/nomor berbeda.',
    'Keluarkan JSON saja dengan skema: {"verdict":"same_entity|different_entity|uncertain","confidence":number,"reason":string}.',
  ].join('\n');

  const user = JSON.stringify({
    target: input.target,
    candidate: input.candidate,
    local_scores: input.localScores,
  });

  return { system, user, promptVersion: PROMPT_VERSION };
}
