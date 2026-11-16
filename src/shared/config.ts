import type { ExtensionSettings } from './types';

/**
 * Default configuration. Mirrors IMPLEMENTATION_PLAN.md §70.
 * Thresholds are starting points for calibration, NOT final truth.
 */
export const DEFAULT_CONFIG: ExtensionSettings = {
  excel: {
    skipCompletedRows: true,
    duplicateSeparator: ';',
    reprocessCompleted: false,
  },

  search: {
    maxQueriesPerTarget: 4,
    maxAiVariants: 2,
  },

  scroll: {
    stepRatio: 0.8,
    noNewCandidateRoundsToStop: 3,
    maxPasses: 40,
    settleTimeoutMs: 2000,
  },

  matching: {
    autoAcceptThreshold: 0.92,
    aiReviewThreshold: 0.72,
    aiAcceptConfidence: 0.85,
  },

  retry: {
    domOperation: 2,
    search: 2,
    drawer: 2,
    aiNetwork: 2,
  },

  ai: {
    enabled: true,
    baseUrl: 'http://localhost:20128/v1',
    primaryModel: 'cmc/deepseek/deepseek-v4-flash',
    fallbackModel: 'cmc/deepseek/deepseek-v4-pro',
    // authToken intentionally absent — gateway holds the real key (user decision).
    timeoutMs: 12000,
    temperature: 0.1,
    maxTokens: 300,
  },
};

/** Required Excel headers (matched by name, not column letter). */
export const REQUIRED_HEADERS = [
  'data1',
  'code_identity',
  'assignment_id_duplicate',
  'nama_duplicate',
] as const;

/** Strongly recommended (optional) headers. */
export const OPTIONAL_HEADERS = ['assignment_id'] as const;

/** IndexedDB database + object store names. */
export const DB_NAME = 'fasih-automation';
export const DB_VERSION = 1;
export const STORE_JOBS = 'jobs';
export const STORE_ORIGINAL_FILES = 'originalFiles';
export const STORE_TARGETS = 'targets';
export const STORE_ROW_RESULTS = 'rowResults';
export const STORE_AI_CACHE = 'aiCache';
export const STORE_RUN_METRICS = 'runMetrics';
export const STORE_MANUAL_REVIEWS = 'manualReviews';

/** chrome.storage.local keys. */
export const STORAGE_SETTINGS_KEY = 'fasih_settings';
export const STORAGE_JOB_POINTER_KEY = 'fasih_active_job_id';
export const STORAGE_LOGS_KEY = 'fasih_logs';
