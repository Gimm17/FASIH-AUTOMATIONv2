/**
 * Minimal IndexedDB wrapper for job checkpointing (IMPLEMENTATION_PLAN.md §4.1.8).
 * chrome.storage.local is used only for small settings + the active job pointer.
 *
 * Store key paths:
 *   jobs           → id            (JobState.id)
 *   originalFiles  → jobId         ({ jobId, fileName, bytes })
 *   targets        → jobId         ({ jobId, rows: TargetRow[] })
 *   rowResults     → id            (id = `${jobId}:${rowNumber}`)
 *   aiCache        → key
 *   runMetrics     → jobId
 *   manualReviews  → id            (id = `${jobId}:${rowNumber}`)
 */

import {
  DB_NAME,
  DB_VERSION,
  STORE_JOBS,
  STORE_ORIGINAL_FILES,
  STORE_TARGETS,
  STORE_ROW_RESULTS,
  STORE_AI_CACHE,
  STORE_RUN_METRICS,
  STORE_MANUAL_REVIEWS,
} from '@shared/config';
import type { JobState, RowResult, TargetRow, RunMetrics, ManualReviewItem } from '@shared/types';
import type { AiQueryCorrection, AiCandidateVerdict } from '@ai/schemas';

export interface OriginalFileRecord {
  jobId: string;
  fileName: string;
  bytes: ArrayBuffer;
}

export interface TargetsRecord {
  jobId: string;
  rows: TargetRow[];
}

export interface AiCacheRecord<T = unknown> {
  key: string;
  response: T;
  model: string;
  promptVersion: string;
  timestamp: string;
}

export type ObjectStoreName =
  | typeof STORE_JOBS
  | typeof STORE_ORIGINAL_FILES
  | typeof STORE_TARGETS
  | typeof STORE_ROW_RESULTS
  | typeof STORE_AI_CACHE
  | typeof STORE_RUN_METRICS
  | typeof STORE_MANUAL_REVIEWS;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable in this context'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_JOBS)) db.createObjectStore(STORE_JOBS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_ORIGINAL_FILES)) db.createObjectStore(STORE_ORIGINAL_FILES, { keyPath: 'jobId' });
      if (!db.objectStoreNames.contains(STORE_TARGETS)) db.createObjectStore(STORE_TARGETS, { keyPath: 'jobId' });
      if (!db.objectStoreNames.contains(STORE_ROW_RESULTS)) db.createObjectStore(STORE_ROW_RESULTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_AI_CACHE)) db.createObjectStore(STORE_AI_CACHE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(STORE_RUN_METRICS)) db.createObjectStore(STORE_RUN_METRICS, { keyPath: 'jobId' });
      if (!db.objectStoreNames.contains(STORE_MANUAL_REVIEWS)) db.createObjectStore(STORE_MANUAL_REVIEWS, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('failed to open ' + DB_NAME));
  });
  return dbPromise;
}

function tx<T>(store: ObjectStoreName, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error(`idb ${mode} failed on ${store}`));
      }),
  );
}

export const db = {
  put(store: ObjectStoreName, value: unknown): Promise<IDBValidKey> {
    return tx(store, 'readwrite', (s) => s.put(value));
  },
  get<T>(store: ObjectStoreName, key: IDBValidKey): Promise<T | undefined> {
    return tx<T>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
  },
  delete(store: ObjectStoreName, key: IDBValidKey): Promise<undefined> {
    return tx(store, 'readwrite', (s) => s.delete(key));
  },
  clear(store: ObjectStoreName): Promise<undefined> {
    return tx(store, 'readwrite', (s) => s.clear());
  },
};

// ── Typed convenience helpers ───────────────────────────────────────────────────

export const jobStore = {
  save(job: JobState): Promise<IDBValidKey> {
    return db.put(STORE_JOBS, job);
  },
  get(jobId: string): Promise<JobState | undefined> {
    return db.get<JobState>(STORE_JOBS, jobId);
  },
};

export const originalFileStore = {
  save(record: OriginalFileRecord): Promise<IDBValidKey> {
    return db.put(STORE_ORIGINAL_FILES, record);
  },
  get(jobId: string): Promise<OriginalFileRecord | undefined> {
    return db.get<OriginalFileRecord>(STORE_ORIGINAL_FILES, jobId);
  },
};

export const targetStore = {
  save(record: TargetsRecord): Promise<IDBValidKey> {
    return db.put(STORE_TARGETS, record);
  },
  get(jobId: string): Promise<TargetsRecord | undefined> {
    return db.get<TargetsRecord>(STORE_TARGETS, jobId);
  },
};

export function rowResultId(jobId: string, rowNumber: number): string {
  return `${jobId}:${rowNumber}`;
}

export const rowResultStore = {
  save(jobId: string, result: RowResult): Promise<IDBValidKey> {
    return db.put(STORE_ROW_RESULTS, { id: rowResultId(jobId, result.rowNumber), ...result });
  },
  async getAll(jobId: string): Promise<RowResult[]> {
    const all = await openDb().then(
      (database) =>
        new Promise<Array<RowResult & { id: string }>>((resolve, reject) => {
          const transaction = database.transaction(STORE_ROW_RESULTS, 'readonly');
          const request = transaction.objectStore(STORE_ROW_RESULTS).getAll();
          request.onsuccess = () => resolve((request.result ?? []) as Array<RowResult & { id: string }>);
          request.onerror = () => reject(request.error ?? new Error('getAll rowResults failed'));
        }),
    );
    return all.filter((r) => r.id.startsWith(`${jobId}:`));
  },
};

export const runMetricsStore = {
  save(jobId: string, metrics: RunMetrics): Promise<IDBValidKey> {
    return db.put(STORE_RUN_METRICS, { jobId, ...metrics });
  },
};

export const manualReviewStore = {
  save(jobId: string, item: ManualReviewItem): Promise<IDBValidKey> {
    return db.put(STORE_MANUAL_REVIEWS, { id: rowResultId(jobId, item.rowNumber), jobId, ...item });
  },
  delete(jobId: string, rowNumber: number): Promise<undefined> {
    return db.delete(STORE_MANUAL_REVIEWS, rowResultId(jobId, rowNumber));
  },
  async getAll(jobId: string): Promise<ManualReviewItem[]> {
    const all = await openDb().then(
      (database) =>
        new Promise<Array<ManualReviewItem & { id: string; jobId?: string }>>((resolve, reject) => {
          const transaction = database.transaction(STORE_MANUAL_REVIEWS, 'readonly');
          const request = transaction.objectStore(STORE_MANUAL_REVIEWS).getAll();
          request.onsuccess = () => resolve((request.result ?? []) as Array<ManualReviewItem & { id: string; jobId?: string }>);
          request.onerror = () => reject(request.error ?? new Error('getAll manualReviews failed'));
        }),
    );
    return all.filter((x) => x.jobId === jobId);
  },
};

export const aiCacheStore = {
  getQueryCorrection(key: string) {
    return db.get<AiCacheRecord<AiQueryCorrection>>(STORE_AI_CACHE, key);
  },
  getCandidateVerdict(key: string) {
    return db.get<AiCacheRecord<AiCandidateVerdict>>(STORE_AI_CACHE, key);
  },
  put(record: AiCacheRecord): Promise<IDBValidKey> {
    return db.put(STORE_AI_CACHE, record);
  },
  clear(): Promise<undefined> {
    return db.clear(STORE_AI_CACHE);
  },
};

export { STORE_JOBS, STORE_ORIGINAL_FILES, STORE_TARGETS, STORE_ROW_RESULTS, STORE_AI_CACHE, STORE_RUN_METRICS, STORE_MANUAL_REVIEWS };
