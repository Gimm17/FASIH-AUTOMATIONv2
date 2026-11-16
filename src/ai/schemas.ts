import { z } from 'zod';

/**
 * Zod schemas for AI structured output (IMPLEMENTATION_PLAN.md §17, §23, §24).
 * The AI is NEVER the decision engine — these validate the AI's response so a malformed
 * reply degrades gracefully to the deterministic path / manual review.
 */

export const AiQueryCorrectionSchema = z.object({
  corrected_name: z.string().min(1).max(200),
  query_variants: z.array(z.string().min(2).max(200)).max(2),
  confidence: z.number().min(0).max(1),
});
export type AiQueryCorrection = z.infer<typeof AiQueryCorrectionSchema>;

export const AiCandidateVerdictSchema = z.object({
  verdict: z.enum(['same_entity', 'different_entity', 'uncertain']),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500),
});
export type AiCandidateVerdict = z.infer<typeof AiCandidateVerdictSchema>;

/** Parse a query-correction AI response (accepts raw JSON or JSON-in-prose). */
export function parseAiQueryCorrection(raw: string): AiQueryCorrection {
  const json = extractJson(raw);
  const parsed = AiQueryCorrectionSchema.safeParse(json);
  if (parsed.success) return parsed.data;
  // Tolerant fallback: if AI returned only an array of variants, synthesize an object.
  try {
    const arr = Array.isArray(json)
      ? json
      : typeof json === 'string'
        ? JSON.parse(json)
        : null;
    if (Array.isArray(arr) && arr.every((x) => typeof x === 'string')) {
      const variants = arr.slice(0, 2).map((s) => String(s));
      return AiQueryCorrectionSchema.parse({
        corrected_name: variants[0] ?? '',
        query_variants: variants,
        confidence: 0.5,
      });
    }
  } catch {
    // fall through to error
  }
  throw new Error('AI_INVALID_RESPONSE: query correction does not match schema');
}

/** Parse a candidate-adjudication AI response. */
export function parseAiCandidateVerdict(raw: string): AiCandidateVerdict {
  const json = extractJson(raw);
  const parsed = AiCandidateVerdictSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error('AI_INVALID_RESPONSE: candidate verdict does not match schema');
  }
  return parsed.data;
}

/**
 * Extract the first balanced JSON object/array from a model response that may include
 * prose or markdown fences. Defensive against the common "```json ... ```" wrapping.
 */
export function extractJson(raw: string): unknown {
  if (!raw) throw new Error('AI_INVALID_RESPONSE: empty');
  let s = String(raw).trim();

  // Strip markdown code fences.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && fence[1]) s = fence[1].trim();

  // Try direct parse first.
  try {
    return JSON.parse(s);
  } catch {
    // continue
  }

  // Find the first balanced { ... } or [ ... ].
  const objStart = s.indexOf('{');
  const arrStart = s.indexOf('[');
  let start = -1;
  let open = '';
  let close = '';
  if (objStart !== -1 && (arrStart === -1 || objStart < arrStart)) {
    start = objStart;
    open = '{';
    close = '}';
  } else if (arrStart !== -1) {
    start = arrStart;
    open = '[';
    close = ']';
  }
  if (start === -1) throw new Error('AI_INVALID_RESPONSE: no JSON found');

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) {
        esc = false;
      } else if (ch === '\\') {
        esc = true;
      } else if (ch === '"') {
        inStr = false;
      }
      continue;
    }
    if (ch === '"') {
      inStr = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        const slice = s.slice(start, i + 1);
        try {
          return JSON.parse(slice);
        } catch {
          throw new Error('AI_INVALID_RESPONSE: unbalanced JSON');
        }
      }
    }
  }
  throw new Error('AI_INVALID_RESPONSE: unbalanced JSON');
}
