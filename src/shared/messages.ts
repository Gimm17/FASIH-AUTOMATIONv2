// Typed message contract between content script / service worker / side panel.
// Responses are typed; AI + DOM responses are additionally Zod-validated at the boundary.

import type { LogEntry } from './logger';
import type { JobState, RowResult, ExtensionSettings, RowState, DuplicateResult, ManualReviewItem } from './types';

// ── Content-script ↔ service-worker / side-panel DOM commands ──────────────────
export type ContentCommand =
  | { type: 'FASIH_PING' }
  | { type: 'FASIH_DETECT_LOGIN' }
  | { type: 'FASIH_ENSURE_LIST_VIEW' }
  | { type: 'FASIH_SEARCH'; query: string }
  | { type: 'FASIH_COLLECT_CARDS' }
  | { type: 'FASIH_OPEN_CARD'; cardCode: string }
  | { type: 'FASIH_READ_REVIEW_LINK' }
  | { type: 'FASIH_CLOSE_DRAWER' }
  | { type: 'FASIH_HAS_LIST_VIEW' };

/** Commands the service worker probes the FASIH tab with (used by the side panel). */
export type TabProbeCommand = { type: 'FASIH_PING_TAB' };

// ── AI commands (handled by service worker) ────────────────────────────────────
export interface QueryCorrectionInput {
  targetName: string;
  facilityType?: string;
  protectedTokens: string[];
}
export interface CandidateReviewInput {
  target: { name: string; facilityType?: string; protectedTokens: string[] };
  candidate: { name: string; facilityType?: string; protectedTokens: string[] };
  localScores: { levenshtein: number; tokenOverlap: number; combined: number };
}

export type AiCommand =
  | { type: 'AI_TEST_CONNECTION' }
  | { type: 'AI_QUERY_CORRECTION'; payload: QueryCorrectionInput }
  | { type: 'AI_CANDIDATE_REVIEW'; payload: CandidateReviewInput };

// ── Job / lifecycle / export commands ───────────────────────────────────────────
export type JobCommand =
  | { type: 'JOB_START'; jobId: string }
  | { type: 'JOB_PAUSE' }
  | { type: 'JOB_RESUME' }
  | { type: 'JOB_STOP' }
  | { type: 'JOB_RETRY_ERRORS' }
  | { type: 'JOB_ACCEPT_MANUAL'; jobId: string; rowNumber: number; candidateCode: string };

export interface DownloadPayload {
  jobId: string;
}

// ── Telemetry / streaming events (service worker → side panel) ────────────────
export type TelemetryEvent =
  | { type: 'LOG'; entry: LogEntry }
  | { type: 'PROGRESS'; job: JobState }
  | { type: 'ROW_STATE'; rowNumber: number; state: RowState; query?: string }
  | { type: 'ROW_RESULT'; result: RowResult }
  | { type: 'PARTIAL_RESULT'; rowNumber: number; duplicates: DuplicateResult[] }
  | { type: 'JOB_UPDATED'; job: JobState }
  | { type: 'MANUAL_REVIEW'; item: ManualReviewItem }
  | { type: 'AI_STATUS'; status: 'connected' | 'error' | 'disabled'; detail?: string }
  | { type: 'FASIH_STATUS'; status: 'connected' | 'not_found' | 'login_required'; tabId?: number };

export type ExtensionMessage =
  | ContentCommand
  | AiCommand
  | JobCommand
  | TabProbeCommand
  | { type: 'DOWNLOAD_OUTPUT'; payload: DownloadPayload }
  | { type: 'UPLOAD_WORKBOOK'; jobId: string; fileName: string; sheetName?: string }
  | { type: 'GET_SETTINGS' }
  | { type: 'SET_SETTINGS'; settings: ExtensionSettings }
  | { type: 'SUBSCRIBE_TELEMETRY' }
  | TelemetryEvent;

// ── Response shapes ─────────────────────────────────────────────────────────────
/** Universal content-command envelope: never throws across the message channel. */
export type CommandResult<T> = { ok: true; data: T } | { ok: false; code: string; message: string };

export interface PingResult {
  ok: boolean;
  isRunning: boolean;
  url?: string;
}

export interface LoginCheckResult {
  loginRequired: boolean;
  url: string;
}

export interface ListViewResult {
  listView: boolean;
  switched: boolean;
}

/** Why the virtual-scroll collection pass stopped. */
export type CollectStopReason = 'bottom' | 'no_new_candidates' | 'max_passes' | 'no_container';

export interface CollectCardsResult {
  candidates: Array<{
    sourceQuery: string;
    cardName: string;
    cardCode: string;
    rawText: string;
    metadata: Record<string, string>;
  }>;
  scrollPasses: number;
  reachedBottom: boolean;
  stoppedBy: CollectStopReason;
}

export interface ReadReviewLinkResult {
  href: string;
  assignmentId: string;
}

export interface AiConnectionResult {
  ok: boolean;
  status: 'connected' | 'error' | 'disabled';
  detail?: string;
  models?: string[];
}

export interface AiQueryCorrectionResult {
  correctedName: string;
  queryVariants: string[];
  confidence: number;
}

export interface AiCandidateReviewResult {
  verdict: 'same_entity' | 'different_entity' | 'uncertain';
  confidence: number;
  reason: string;
}

export interface DownloadResult {
  ok: boolean;
  downloadId?: number;
  error?: string;
}

export interface UploadResult {
  ok: boolean;
  job?: JobState;
  error?: string;
}

export interface SubscribeResult {
  job: JobState | null;
  results: RowResult[];
  manualReviews: ManualReviewItem[];
}

/** Send a message to the content script of a specific tab. */
export async function sendToContent<T>(
  tabId: number,
  message: ContentCommand,
): Promise<CommandResult<T>> {
  return (await chrome.tabs.sendMessage(tabId, message)) as CommandResult<T>;
}

/** Send a message to the background service worker. */
export async function sendToBackground<T>(message: ExtensionMessage): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T;
}
