import type { AISettings } from '@shared/types';
import { AutomationError } from '@core/errors';
import { withRetry } from '@core/retry';
import type { AiQueryCorrection, AiCandidateVerdict } from './schemas';
import { parseAiQueryCorrection, parseAiCandidateVerdict } from './schemas';
import { buildQueryCorrectionPrompt, buildCandidateAdjudicationPrompt } from './prompts';
import type { QueryCorrectionInput, CandidateReviewInput } from '@shared/messages';

/**
 * OpenAI-compatible client. Requests go to the localhost gateway which holds the upstream
 * credential. The extension sends NO secret by default; an optional scoped token, if
 * configured by the user, is sent as a Bearer header and is never logged.
 */

interface ChatRequest {
  system: string;
  user: string;
  model: string;
}

export interface AiClient {
  /** Test connectivity + list models (best-effort). */
  health(): Promise<{ ok: boolean; detail?: string; models?: string[] }>;
  correctQuery(input: QueryCorrectionInput): Promise<AiQueryCorrection>;
  adjudicate(input: CandidateReviewInput): Promise<AiCandidateVerdict>;
}

/** Factory: builds a client bound to settings. The transport is injectable for tests. */
export function createAiClient(
  settings: AISettings,
  transport: AiTransport,
): AiClient {
  return {
    async health() {
      return transport.health(settings);
    },

    async correctQuery(input) {
      const { system, user } = buildQueryCorrectionPrompt(input);
      const raw = await callChat(transport, settings, { system, user, model: settings.primaryModel });
      return parseAiQueryCorrection(raw);
    },

    async adjudicate(input) {
      const { system, user } = buildCandidateAdjudicationPrompt(input);
      const raw = await callChat(transport, settings, { system, user, model: settings.primaryModel });
      let verdict = parseAiCandidateVerdict(raw);
      // Two-tier router: if primary is uncertain AND a fallback model is configured, try it.
      if (verdict.verdict === 'uncertain' && settings.fallbackModel) {
        try {
          const raw2 = await callChat(transport, settings, { system, user, model: settings.fallbackModel });
          verdict = parseAiCandidateVerdict(raw2);
        } catch {
          // keep primary verdict
        }
      }
      return verdict;
    },
  };
}

/** Injectable transport so tests can stub fetch without touching the network. */
export interface AiTransport {
  chat(settings: AISettings, req: { system: string; user: string; model: string }): Promise<string>;
  health(settings: AISettings): Promise<{ ok: boolean; detail?: string; models?: string[] }>;
}

async function callChat(
  transport: AiTransport,
  settings: AISettings,
  req: ChatRequest,
): Promise<string> {
  if (!settings.enabled) {
    throw new AutomationError('AI_UNREACHABLE', 'AI disabled in settings');
  }
  try {
    return await withRetry(
      () => transport.chat(settings, req),
      { attempts: 2, backoffMs: [500, 1000] },
    );
  } catch (err) {
    if (err instanceof AutomationError) {
      // Typed errors (incl. non-retryable AI_AUTH_FAILED) surface unchanged.
      throw err;
    }
    throw new AutomationError('AI_UNREACHABLE', err instanceof Error ? err.message : 'unknown');
  }
}

/**
 * Default browser transport (runs in the service worker; has host permission for localhost).
 * Returns only the trimmed content string — no headers/keys leak to callers.
 */
export const browserAiTransport: AiTransport = {
  async chat(settings, req) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), settings.timeoutMs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (settings.authToken) headers.Authorization = `Bearer ${settings.authToken}`;
      const resp = await fetch(`${trimSlash(settings.baseUrl)}/chat/completions`, {
        method: 'POST',
        signal: controller.signal,
        headers,
        body: JSON.stringify({
          model: req.model,
          temperature: settings.temperature,
          max_tokens: settings.maxTokens,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
          ],
        }),
      });
      if (resp.status === 401 || resp.status === 403) {
        throw new AutomationError('AI_AUTH_FAILED', `HTTP ${resp.status}`);
      }
      if (!resp.ok) {
        throw new AutomationError('AI_UNREACHABLE', `HTTP ${resp.status}`);
      }
      const data = (await resp.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const content = data?.choices?.[0]?.message?.content?.trim();
      if (!content) throw new AutomationError('AI_INVALID_RESPONSE', 'empty content');
      return content;
    } catch (err) {
      if (err instanceof AutomationError) throw err;
      throw new AutomationError('AI_UNREACHABLE', err instanceof Error ? err.message : 'fetch failed');
    } finally {
      clearTimeout(timer);
    }
  },

  async health(settings) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(settings.timeoutMs, 5000));
      const headers: Record<string, string> = {};
      if (settings.authToken) headers.Authorization = `Bearer ${settings.authToken}`;
      const resp = await fetch(`${trimSlash(settings.baseUrl)}/models`, {
        method: 'GET',
        signal: controller.signal,
        headers,
      });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, detail: `HTTP ${resp.status}` };
      const data = (await resp.json()) as { data?: Array<{ id?: string }> };
      const models = (data?.data ?? []).map((m) => m.id ?? '').filter(Boolean);
      return { ok: true, models };
    } catch (err) {
      return { ok: false, detail: err instanceof Error ? err.message : 'unreachable' };
    }
  },
};

function trimSlash(s: string): string {
  return s.endsWith('/') ? s.slice(0, -1) : s;
}
