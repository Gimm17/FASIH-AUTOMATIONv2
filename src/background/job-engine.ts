/**
 * Job engine — the orchestrator (IMPLEMENTATION_PLAN.md §3 flow, §9 state machine).
 *
 * Runs inside the service worker. Per TargetRow:
 *   build queries → search via content script → auto-scroll collect → evaluate candidates
 *   (hard guards first, AI only for the ambiguous band) → for accepted candidates re-search
 *   the exact code, open the drawer, READ the review href (never click Review), extract the
 *   UUID, close the drawer → persist RowResult + checkpoint JobState.
 *
 * Pause/Stop abort the in-flight DOM work via a JobCancellationToken; every row boundary is
 * a checkpoint, so resume continues from the next target after SW restart.
 */

import { JobCancellationToken } from '@core/cancellation';
import { AutomationError, CancellationError, isCancellation, normalizeError } from '@core/errors';
import { withRetry } from '@core/retry';
import { logger } from '@shared/logger';
import { FASIH_URL_PATTERN } from '@shared/constants';
import { STORAGE_JOB_POINTER_KEY } from '@shared/config';
import type { ExtensionSettings, JobState, RowResult, RowState, TargetRow, SearchCandidate, CandidateEvaluation, DuplicateResult } from '@shared/types';
import type {
  ContentCommand,
  CommandResult,
  CollectCardsResult,
  ReadReviewLinkResult,
  TelemetryEvent,
} from '@shared/messages';
import { buildAlternativeQueries } from '@ai/query-generator';
import { evaluateCandidate, getAcceptedCandidates, hasAmbiguousCandidates } from '@matching/verifier';
import { normalizeIdentityCode } from '@matching/normalize';
import { isSameAssignmentId } from '@shared/uuid';
import { loadWorkbook, parseTargetRows } from '@excel/excel-adapter';
import { getAiClient, adjudicateCandidate, loadSettings } from './ai-service';
import { jobStore, targetStore, rowResultStore, manualReviewStore, originalFileStore } from '@persistence/db';

function broadcast(event: TelemetryEvent): void {
  try {
    chrome.runtime.sendMessage(event).catch(() => {
      /* no listener (panel closed) — fine */
    });
  } catch {
    /* SW shutting down */
  }
}

async function contentCall<T>(tabId: number, command: ContentCommand, attempts: number): Promise<T> {
  const result = await withRetry(
    async () => {
      const resp = (await chrome.tabs.sendMessage(tabId, command)) as CommandResult<T>;
      if (!resp) throw new AutomationError('DOM_CHANGED', 'empty response from content script');
      if (!resp.ok) throw new AutomationError('DOM_CHANGED', `${resp.code}: ${resp.message}`);
      return resp.data;
    },
    { attempts, backoffMs: [400, 900] },
  );
  return result;
}

export class JobEngine {
  private token = new JobCancellationToken();
  private job: JobState | null = null;
  private settings: ExtensionSettings | null = null;
  private tabId: number | null = null;
  private running = false;

  get currentJob(): JobState | null {
    return this.job;
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(jobId: string): Promise<void> {
    if (this.running) throw new Error('job already running');
    const job = await jobStore.get(jobId);
    if (!job) throw new AutomationError('EXCEL_INVALID', `job ${jobId} not found`);
    const targets = await targetStore.get(jobId);
    if (!targets) throw new AutomationError('EXCEL_INVALID', `targets for job ${jobId} not found`);

    this.job = {
      ...job,
      status: 'RUNNING',
      paused: false,
      startedAt: job.startedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await jobStore.save(this.job);
    this.token.reset();
    await this.runLoop(targets.rows);
  }

  pause(): void {
    if (!this.running) return;
    this.token.pause();
  }

  async resume(): Promise<void> {
    if (this.running) return;
    const jobId = this.job?.id ?? (await getActiveJobId());
    if (!jobId) return;
    const job = await jobStore.get(jobId);
    if (!job || job.status !== 'PAUSED') return;
    const targets = await targetStore.get(jobId);
    if (!targets) return;

    this.job = { ...job, status: 'RUNNING', paused: false, updatedAt: new Date().toISOString() };
    await jobStore.save(this.job);
    this.token.reset();
    await this.runLoop(targets.rows);
  }

  stop(): void {
    if (!this.running) return;
    this.token.stop();
  }

  /** Re-run rows whose previous status was ERROR (JOB_RETRY_ERRORS). */
  async retryErrors(): Promise<void> {
    if (this.running) return;
    const jobId = this.job?.id ?? (await getActiveJobId());
    if (!jobId) return;
    const job = await jobStore.get(jobId);
    const targets = await targetStore.get(jobId);
    if (!job || !targets) return;

    const failedRows = await rowResultStore.getAll(jobId);
    const errorRows = new Set(failedRows.filter((r) => r.status === 'ERROR').map((r) => r.rowNumber));
    if (errorRows.size === 0) return;

    this.job = {
      ...job,
      status: 'RUNNING',
      paused: false,
      errorCount: 0,
      currentTargetIndex: 0,
      updatedAt: new Date().toISOString(),
    };
    await jobStore.save(this.job);
    this.token.reset();
    await this.runLoop(targets.rows, errorRows);
  }

  /** Accept one ambiguous candidate from the manual review queue (JOB_ACCEPT_MANUAL). */
  async acceptManualReview(jobId: string, rowNumber: number, candidateCode: string): Promise<void> {
    if (this.running) throw new Error('stop the running job before resolving manual reviews');
    const job = await jobStore.get(jobId);
    const targets = await targetStore.get(jobId);
    if (!job || !targets) throw new Error('job not found');
    const target = targets.rows.find((t) => t.rowNumber === rowNumber);
    if (!target) throw new Error(`row ${rowNumber} not found`);

    const settings = this.settings ?? (await loadSettings());
    const tabId = await this.requireFasihTab();

    const duplicates: DuplicateResult[] = [];
    const link = await this.extractAssignmentId(tabId, { cardCode: candidateCode, cardName: '' }, target, settings);
    if (link) duplicates.push(link);

    const status = duplicates.length > 0 ? 'DONE' : 'ERROR';
    const result: RowResult = {
      rowNumber,
      targetName: target.data1,
      codeIdentity: target.codeIdentity,
      status,
      duplicates,
      queryHistory: [`manual-accept:${candidateCode}`],
      updatedAt: new Date().toISOString(),
    };
    await rowResultStore.save(jobId, result);
    await manualReviewStore.delete(jobId, rowNumber);
    broadcast({ type: 'ROW_RESULT', result });
    logger.success(`manual review accepted → ${status}`, { row: rowNumber });
  }

  // ── Main loop ───────────────────────────────────────────────────────────────

  private async runLoop(targets: TargetRow[], onlyRows?: Set<number>): Promise<void> {
    this.running = true;
    try {
      this.settings = await loadSettings();
      const ai = await getAiClient(this.settings);
      this.tabId = await this.requireFasihTab();

      // One-time setup per run: ensure the FASIH list view is active.
      await contentCall(this.tabId, { type: 'FASIH_ENSURE_LIST_VIEW' }, this.settings.retry.domOperation);

      for (let i = this.job?.currentTargetIndex ?? 0; i < targets.length; i++) {
        this.assertNotAborted();
        const target = targets[i];
        if (onlyRows && !onlyRows.has(target.rowNumber)) continue;

        this.job = this.withJob({ currentTargetIndex: i + 1 });
        await this.processTarget(target, ai);
        this.job = this.withJob({ processedCount: (this.job.processedCount ?? 0) + 1 });
        await jobStore.save(this.job);
        broadcast({ type: 'PROGRESS', job: this.job });

        // Pause gate between rows (IMPLEMENTATION_PLAN.md §33).
        if (this.token.paused) {
          this.job = this.withJob({ status: 'PAUSED', paused: true });
          await jobStore.save(this.job);
          broadcast({ type: 'JOB_UPDATED', job: this.job });
          logger.warn('job paused — press Resume to continue');
          return;
        }
      }

      this.job = this.withJob({ status: 'DONE', paused: false });
      await jobStore.save(this.job);
      broadcast({ type: 'JOB_UPDATED', job: this.job });
      logger.success(`job finished: ${this.job.successCount} done, ${this.job.noMatchCount} no-match, ${this.job.manualReviewCount} manual, ${this.job.errorCount} error`);
    } catch (err) {
      await this.handleLoopError(err);
    } finally {
      this.running = false;
    }
  }

  private async handleLoopError(err: unknown): Promise<void> {
    if (isCancellation(err) || err instanceof CancellationError) {
      const reason = err instanceof CancellationError ? err.reason : (err as { reason?: string }).reason === 'PAUSE' ? 'PAUSE' : 'STOP';
      if (reason === 'PAUSE') {
        this.job = this.withJob({ status: 'PAUSED', paused: true });
        broadcast({ type: 'JOB_UPDATED', job: this.job });
        logger.warn('job paused mid-row — the current row will be reprocessed on resume');
      } else {
        this.job = this.withJob({ status: 'STOPPED', paused: false });
        broadcast({ type: 'JOB_UPDATED', job: this.job });
        logger.warn('job stopped by user');
      }
    } else {
      const automationErr = normalizeError(err);
      this.job = this.withJob({ status: 'ERROR', paused: false });
      broadcast({ type: 'JOB_UPDATED', job: this.job });
      logger.error(`job failed: ${automationErr.code} — ${automationErr.message}`);
    }
    if (this.job) await jobStore.save(this.job);
  }

  private assertNotAborted(): void {
    if (this.token.signal.aborted) {
      const raw = (this.token.signal as unknown as { reason?: unknown }).reason;
      throw new CancellationError(typeof raw === 'object' && raw !== null && (raw as { reason?: string }).reason === 'PAUSE' ? 'PAUSE' : 'STOP');
    }
  }

  private withJob(patch: Partial<JobState>): JobState {
    if (!this.job) throw new Error('no active job');
    this.job = { ...this.job, ...patch, updatedAt: new Date().toISOString() };
    return this.job;
  }

  // ── Per-target pipeline ──────────────────────────────────────────────────────

  private async processTarget(target: TargetRow, ai: Awaited<ReturnType<typeof getAiClient>>): Promise<void> {
    const row = target.rowNumber;
    const settings = this.settings!;
    const tabId = this.tabId!;
    const history: string[] = [];

    const setState = (state: RowState, query?: string) => {
      broadcast({ type: 'ROW_STATE', rowNumber: row, state, ...(query ? { query } : {}) });
    };

    try {
      setState('PREPARING');
      const queries = await buildAlternativeQueries(
        target.data1,
        settings.search,
        ai,
        undefined,
        [], // protected tokens are re-derived inside the verifier per candidate
      );
      history.push(...queries.map((q) => q.query));

      const pool = new Map<string, SearchCandidate>();
      const evaluations: CandidateEvaluation[] = [];

      setState('PRIMARY_SEARCH', queries[0]?.query);
      for (const [queryIndex, variant] of queries.entries()) {
        this.assertNotAborted();

        setState(queryIndex === 0 ? 'COLLECTING_PRIMARY' : 'ALTERNATE_SEARCH', variant.query);
        await contentCall(tabId, { type: 'FASIH_SEARCH', query: variant.query }, settings.retry.search);
        const collected = await contentCall<CollectCardsResult>(tabId, { type: 'FASIH_COLLECT_CARDS' }, settings.retry.domOperation);
        if (!collected.reachedBottom && collected.stoppedBy === 'max_passes') {
          logger.warn(`scroll stopped at maxPasses — list may have more cards (query "${variant.query}")`, { row });
        }

        for (const c of collected.candidates) {
          const key = normalizeIdentityCode(c.cardCode) || `${c.cardName}::${c.sourceQuery}`;
          if (pool.has(key)) continue;
          pool.set(key, c);
          evaluations.push(evaluateCandidate(target, c, { settings: settings.matching }));
        }

        // Consult the AI once for candidates that landed in the ambiguous band.
        for (let e = 0; e < evaluations.length; e++) {
          const evaluation = evaluations[e];
          if (evaluation.decision !== 'AI_REVIEW' || evaluation.aiVerdict) continue;
          const verdict = await adjudicateCandidate(target, evaluation.candidate, ai);
          evaluations[e] = evaluateCandidate(target, evaluation.candidate, {
            settings: settings.matching,
            aiVerdict: verdict.verdict,
            aiConfidence: verdict.confidence,
          });
        }

        if (getAcceptedCandidates(evaluations).length > 0) break; // valid candidate found → stop querying
      }

      const accepted = getAcceptedCandidates(evaluations);
      setState('VERIFYING_FINAL');

      if (accepted.length === 0) {
        if (hasAmbiguousCandidates(evaluations)) {
          const item = {
            rowNumber: row,
            targetName: target.data1,
            targetCode: target.codeIdentity,
            candidates: evaluations.filter((e) => e.decision === 'AI_REVIEW' || e.decision === 'MANUAL_REVIEW'),
          };
          await manualReviewStore.save(this.job!.id, item);
          broadcast({ type: 'MANUAL_REVIEW', item });
          await this.finishRow(target, 'MANUAL_REVIEW', [], history);
        } else {
          await this.finishRow(target, 'NO_MATCH', [], history);
        }
        return;
      }

      setState('EXTRACTING_IDS');
      const duplicates: DuplicateResult[] = [];
      for (const evaluation of accepted) {
        this.assertNotAborted();
        const link = await this.extractAssignmentId(tabId, evaluation.candidate, target, settings);
        if (link) duplicates.push(link);
        broadcast({ type: 'PARTIAL_RESULT', rowNumber: row, duplicates });
      }

      if (duplicates.length === 0) {
        await this.finishRow(target, 'ERROR', [], history, 'all accepted candidates failed ID extraction');
        return;
      }
      await this.finishRow(target, 'DONE', duplicates, history);
    } catch (err) {
      if (isCancellation(err)) throw err; // pause/stop propagates to the loop
      const automationErr = normalizeError(err);
      logger.error(`row failed: ${automationErr.code} — ${automationErr.message}`, { row });
      await this.finishRow(target, 'ERROR', [], history, `${automationErr.code}: ${automationErr.message}`);
    }
  }

  /**
   * Sniper extraction for one accepted candidate: re-search its exact code, open the
   * drawer, READ the review href (never click Review), close, verify the UUID isn't the
   * target's own assignment.
   */
  private async extractAssignmentId(
    tabId: number,
    candidate: { cardCode: string; cardName: string },
    target: TargetRow,
    settings: ExtensionSettings,
  ): Promise<DuplicateResult | null> {
    const code = candidate.cardCode;
    await contentCall(tabId, { type: 'FASIH_SEARCH', query: code }, settings.retry.search);
    let link: ReadReviewLinkResult;
    try {
      link = await contentCall<ReadReviewLinkResult>(tabId, { type: 'FASIH_OPEN_CARD', cardCode: code }, settings.retry.drawer);
    } catch (err) {
      const automationErr = normalizeError(err);
      logger.warn(`open card failed for ${code}: ${automationErr.code} — skipped`, { row: target.rowNumber });
      return null;
    }
    try {
      await contentCall(tabId, { type: 'FASIH_CLOSE_DRAWER' }, settings.retry.drawer);
    } catch {
      logger.warn(`drawer close failed for ${code} — continuing`, { row: target.rowNumber });
    }

    if (target.assignmentIdOriginal && isSameAssignmentId(link.assignmentId, target.assignmentIdOriginal)) {
      logger.warn(`self-assignment collision skipped: ${link.assignmentId}`, { row: target.rowNumber });
      return null;
    }
    return {
      candidateCode: code,
      candidateName: candidate.cardName,
      assignmentId: link.assignmentId,
    };
  }

  private async finishRow(
    target: TargetRow,
    status: RowResult['status'],
    duplicates: DuplicateResult[],
    queryHistory: string[],
    error?: string,
  ): Promise<void> {
    const result: RowResult = {
      rowNumber: target.rowNumber,
      targetName: target.data1,
      codeIdentity: target.codeIdentity,
      status,
      duplicates,
      queryHistory,
      ...(error ? { error } : {}),
      updatedAt: new Date().toISOString(),
    };
    await rowResultStore.save(this.job!.id, result);
    broadcast({ type: 'ROW_RESULT', result });

    const job = this.job!;
    this.job = this.withJob({
      successCount: job.successCount + (status === 'DONE' ? 1 : 0),
      noMatchCount: job.noMatchCount + (status === 'NO_MATCH' ? 1 : 0),
      manualReviewCount: job.manualReviewCount + (status === 'MANUAL_REVIEW' ? 1 : 0),
      errorCount: job.errorCount + (status === 'ERROR' ? 1 : 0),
    });
    await jobStore.save(this.job);
    const level = status === 'DONE' ? 'success' : status === 'ERROR' ? 'error' : 'info';
    logger[level](`${status}${duplicates.length ? ` — ${duplicates.length} duplicate(s)` : ''}`, { row: target.rowNumber });
  }

  // ── Tab resolution ───────────────────────────────────────────────────────────

  private async requireFasihTab(): Promise<number> {
    const tabs = await chrome.tabs.query({ url: FASIH_URL_PATTERN });
    const tab = tabs.find((t) => typeof t.id === 'number');
    if (!tab?.id) {
      throw new AutomationError('FASIH_TAB_NOT_FOUND', 'no open FASIH tab — open https://fasih-sm.bps.go.id and log in first');
    }
    // Ping; if the content script isn't there (page predates install), inject once.
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'FASIH_PING' });
    } catch {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/fasih-content.js'] });
    }
    const login = await contentCall<{ loginRequired: boolean; url: string }>(tab.id, { type: 'FASIH_DETECT_LOGIN' }, 1);
    if (login.loginRequired) {
      throw new AutomationError('FASIH_NOT_LOGGED_IN', 'FASIH session requires login');
    }
    return tab.id;
  }
}

async function getActiveJobId(): Promise<string | null> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_JOB_POINTER_KEY)) as unknown as Record<string, string | undefined>;
    return stored[STORAGE_JOB_POINTER_KEY] ?? null;
  } catch {
    return null;
  }
}

/** Prepare a job from an uploaded workbook (UPLOAD_WORKBOOK): parse + persist targets. */
export async function createJobFromWorkbook(jobId: string, fileName: string): Promise<JobState> {
  const record = await originalFileStore.get(jobId);
  if (!record) throw new AutomationError('EXCEL_INVALID', 'uploaded file not found — re-upload the workbook');
  const parsed = loadWorkbook(record.bytes);
  const settings = await loadSettings();
  const targets = parseTargetRows(parsed, { reprocessCompleted: settings.excel.reprocessCompleted });
  await targetStore.save({ jobId, rows: targets });

  const job: JobState = {
    id: jobId,
    sourceFileName: fileName,
    sheetName: parsed.sheetName,
    status: 'READY',
    currentTargetIndex: 0,
    targetCount: targets.length,
    processedCount: 0,
    successCount: 0,
    noMatchCount: 0,
    manualReviewCount: 0,
    errorCount: 0,
    updatedAt: new Date().toISOString(),
    paused: false,
  };
  await jobStore.save(job);
  await chrome.storage.local.set({ [STORAGE_JOB_POINTER_KEY]: jobId });
  return job;
}
