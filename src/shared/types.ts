// Domain types shared across the extension (content script, service worker, side panel,
// excel adapter, matching engine, ai adapter, persistence).

import type { FacilityType, CandidateDecision, RowState, AiVerdict, JobStatus } from './constants';

/** A row extracted from the Excel workbook that is a valid automation target. */
export interface TargetRow {
  /** 1-based sheet row number (header = row 1). */
  rowNumber: number;
  /** Optional original assignment_id (column A) — used as a safety cross-check. */
  assignmentIdOriginal?: string;
  /** data1 (column G) — the entity name to search on FASIH. */
  data1: string;
  /** code_identity (column H) — used for self-exclusion. May be prefixed like "7201 - SE26...". */
  codeIdentity: string;
  /** Pre-existing assignment_id_duplicate value (column X), if any. */
  existingDuplicateIds?: string;
  /** Pre-existing nama_duplicate value (column Y), if any. */
  existingDuplicateNames?: string;
}

/** A parsed FASIH assignment card (primitives only — never persist DOM nodes). */
export interface SearchCandidate {
  sourceQuery: string;
  cardName: string;
  cardCode: string;
  facilityType?: FacilityType;
  rawText: string;
  metadata: Record<string, string>;
}

export interface CandidateEvaluation {
  candidate: SearchCandidate;
  decision: CandidateDecision;
  normalizedTarget: string;
  normalizedCandidate: string;
  levenshteinScore: number;
  tokenOverlapScore: number;
  combinedScore: number;
  facilityMatch: boolean | null;
  protectedTokenMatch: boolean;
  aiVerdict?: AiVerdict;
  aiConfidence?: number;
  reasons: string[];
}

export interface DuplicateResult {
  candidateCode: string;
  candidateName: string;
  assignmentId: string;
}

export type RowResultStatus = 'DONE' | 'NO_MATCH' | 'MANUAL_REVIEW' | 'ERROR' | 'SKIPPED';

export interface RowResult {
  rowNumber: number;
  targetName: string;
  codeIdentity: string;
  status: RowResultStatus;
  duplicates: DuplicateResult[];
  queryHistory: string[];
  error?: string;
  /** Arbitrary-precision ISO timestamp of last update. */
  updatedAt: string;
}

export interface JobState {
  id: string;
  sourceFileName: string;
  sheetName: string;
  status: JobStatus;
  currentTargetIndex: number;
  targetCount: number;
  processedCount: number;
  successCount: number;
  noMatchCount: number;
  manualReviewCount: number;
  errorCount: number;
  startedAt?: string;
  updatedAt: string;
  /** Whether the job is paused (pause gate between rows). */
  paused: boolean;
}

/** Settings exposed in the Side Panel and persisted to chrome.storage.local. */
export interface AISettings {
  enabled: boolean;
  baseUrl: string;
  primaryModel: string;
  fallbackModel?: string;
  /** Optional scoped auth token. The gateway is expected to hold the real key. */
  authToken?: string;
  timeoutMs: number;
  temperature: number;
  maxTokens: number;
}

export interface MatchingSettings {
  autoAcceptThreshold: number;
  aiReviewThreshold: number;
  aiAcceptConfidence: number;
}

export interface ScrollSettings {
  stepRatio: number;
  noNewCandidateRoundsToStop: number;
  maxPasses: number;
  settleTimeoutMs: number;
}

export interface SearchSettings {
  maxQueriesPerTarget: number;
  maxAiVariants: number;
}

export interface RetrySettings {
  domOperation: number;
  search: number;
  drawer: number;
  aiNetwork: number;
}

export interface ExcelSettings {
  skipCompletedRows: boolean;
  duplicateSeparator: string;
  reprocessCompleted: boolean;
}

export interface ExtensionSettings {
  ai: AISettings;
  matching: MatchingSettings;
  scroll: ScrollSettings;
  search: SearchSettings;
  retry: RetrySettings;
  excel: ExcelSettings;
}

/** Manual review queue item for ambiguous candidates. */
export interface ManualReviewItem {
  rowNumber: number;
  targetName: string;
  targetCode: string;
  candidates: CandidateEvaluation[];
}

export interface SelectorDiagnostic {
  key:
    | 'listViewToggle'
    | 'searchInput'
    | 'assignmentCard'
    | 'candidateDetailTrigger'
    | 'drawer'
    | 'reviewAction'
    | 'closeButton';
  matchedSelector: string;
  timestamp: string;
}

export interface RunMetrics {
  targets: number;
  completed: number;
  noMatch: number;
  manualReview: number;
  errors: number;
  primarySearchAccepted: number;
  alternateSearchUsed: number;
  aiCalls: number;
  aiCacheHits: number;
  averageCandidatesPerTarget: number;
  averageTargetDurationMs: number;
}

/** Re-exported narrow type aliases for ergonomics. */
export type { FacilityType, CandidateDecision, RowState, AiVerdict, JobStatus };
