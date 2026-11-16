/**
 * Service worker entry: message router + download manager (IMPLEMENTATION_PLAN.md §4.1).
 * Heavy orchestration lives in job-engine.ts; AI settings/cache in ai-service.ts.
 */

import { logger } from '@shared/logger';
import { FASIH_URL_PATTERN } from '@shared/constants';
import { STORAGE_JOB_POINTER_KEY } from '@shared/config';
import type { ExtensionMessage, TelemetryEvent, DownloadResult, UploadResult, SubscribeResult } from '@shared/messages';
import { buildOutputWorkbook } from '@excel/excel-adapter';
import { loadSettings, saveSettings, getAiClient } from './ai-service';
import { JobEngine, createJobFromWorkbook } from './job-engine';
import { jobStore, rowResultStore, manualReviewStore, originalFileStore } from '@persistence/db';

const engine = new JobEngine();

function broadcast(event: TelemetryEvent): void {
  chrome.runtime.sendMessage(event).catch(() => {
    /* side panel closed — fine */
  });
}

// ── FASIH tab probe ─────────────────────────────────────────────────────────────

async function pingFasihTab(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: FASIH_URL_PATTERN });
  const tab = tabs.find((t) => typeof t.id === 'number');
  if (!tab?.id) {
    broadcast({ type: 'FASIH_STATUS', status: 'not_found' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'FASIH_PING' });
    broadcast({ type: 'FASIH_STATUS', status: 'connected', tabId: tab.id });
  } catch {
    // Content script not injected yet — inject lazily so status is accurate.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content/fasih-content.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'FASIH_PING' });
      broadcast({ type: 'FASIH_STATUS', status: 'connected', tabId: tab.id });
    } catch {
      broadcast({ type: 'FASIH_STATUS', status: 'login_required', tabId: tab.id });
    }
  }
}

// ── Output download ─────────────────────────────────────────────────────────────

async function downloadOutput(jobId: string): Promise<DownloadResult> {
  const job = await jobStore.get(jobId);
  const record = await originalFileStore.get(jobId);
  if (!job || !record) return { ok: false, error: 'job or original workbook not found' };

  const results = await rowResultStore.getAll(jobId);
  const settings = await loadSettings();
  const { filename, arrayBuffer } = buildOutputWorkbook(
    record.bytes,
    results,
    record.fileName,
    settings.excel.duplicateSeparator,
  );

  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  try {
    const downloadId = await chrome.downloads.download({ url, filename, saveAs: false });
    return { ok: true, downloadId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'download failed' };
  } finally {
    // Give Chrome a minute to start the download before revoking the blob URL.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

// ── Message router ──────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((err: unknown) => {
      logger.error(`message handler failed: ${message.type} — ${err instanceof Error ? err.message : String(err)}`);
      sendResponse({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  return true; // async response
});

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    // ── Settings ──
    case 'GET_SETTINGS':
      return loadSettings();
    case 'SET_SETTINGS':
      await saveSettings(message.settings);
      return { ok: true };

    // ── Workbook / job lifecycle ──
    case 'UPLOAD_WORKBOOK':
      try {
        const job = await createJobFromWorkbook(message.jobId, message.fileName);
        logger.success(`workbook loaded: ${job.targetCount} target row(s) on "${job.sheetName}"`);
        const result: UploadResult = { ok: true, job };
        return result;
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        logger.error(`workbook load failed: ${detail}`);
        return { ok: false, error: detail } satisfies UploadResult;
      }

    case 'JOB_START':
      // Async fire-and-forget: the loop broadcasts PROGRESS telemetry as it advances.
      void engine.start(message.jobId).catch((err: unknown) =>
        logger.error(`start failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      return { ok: true };

    case 'JOB_PAUSE':
      engine.pause();
      return { ok: true };
    case 'JOB_RESUME':
      void engine.resume().catch((err: unknown) =>
        logger.error(`resume failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      return { ok: true };
    case 'JOB_STOP':
      engine.stop();
      return { ok: true };
    case 'JOB_RETRY_ERRORS':
      void engine.retryErrors().catch((err: unknown) =>
        logger.error(`retry failed: ${err instanceof Error ? err.message : String(err)}`),
      );
      return { ok: true };
    case 'JOB_ACCEPT_MANUAL':
      try {
        await engine.acceptManualReview(message.jobId, message.rowNumber, message.candidateCode);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }

    case 'DOWNLOAD_OUTPUT': {
      const result = await downloadOutput(message.payload.jobId);
      if (result.ok) logger.success(`output download started (id ${result.downloadId})`);
      else logger.error(`download failed: ${result.error}`);
      return result;
    }

    // ── Telemetry subscription (side panel mount) ──
    case 'SUBSCRIBE_TELEMETRY': {
      const jobId = engine.currentJob?.id ?? (await getPointerJobId());
      const job = jobId ? ((await jobStore.get(jobId)) ?? null) : null;
      const results = jobId ? await rowResultStore.getAll(jobId) : [];
      const manualReviews = jobId ? await manualReviewStore.getAll(jobId) : [];
      void pingFasihTab();
      const response: SubscribeResult = { job, results, manualReviews };
      return response;
    }

    case 'FASIH_PING_TAB':
      await pingFasihTab();
      return { ok: true };

    // ── AI ──
    case 'AI_TEST_CONNECTION': {
      const settings = await loadSettings();
      if (!settings.ai.enabled) {
        broadcast({ type: 'AI_STATUS', status: 'disabled' });
        return { ok: false, status: 'disabled' };
      }
      const ai = await getAiClient(settings);
      const health = ai ? await ai.health() : { ok: false, detail: 'disabled' };
      broadcast({
        type: 'AI_STATUS',
        status: health.ok ? 'connected' : 'error',
        ...(health.detail ? { detail: health.detail } : {}),
      });
      return { ok: health.ok, ...(health.detail ? { detail: health.detail } : {}), ...(health.models ? { models: health.models } : {}) };
    }

    case 'AI_QUERY_CORRECTION':
    case 'AI_CANDIDATE_REVIEW': {
      // Direct AI passthrough (used by the side panel's diagnostics).
      const settings = await loadSettings();
      const ai = await getAiClient(settings);
      if (!ai) return { ok: false, error: 'AI disabled' };
      if (message.type === 'AI_QUERY_CORRECTION') return ai.correctQuery(message.payload);
      return ai.adjudicate(message.payload);
    }

    default:
      // Telemetry events sent by other contexts are not handled here.
      return { ok: true };
  }
}

async function getPointerJobId(): Promise<string | null> {
  try {
    const stored = (await chrome.storage.local.get(STORAGE_JOB_POINTER_KEY)) as unknown as Record<string, string | undefined>;
    return stored[STORAGE_JOB_POINTER_KEY] ?? null;
  } catch {
    return null;
  }
}

// ── Lifecycle ───────────────────────────────────────────────────────────────────

// Open the side panel when the toolbar action is clicked.
const enableSidePanelOnAction = (): void => {
  if (chrome.sidePanel?.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
};

chrome.runtime.onInstalled.addListener(enableSidePanelOnAction);
chrome.runtime.onStartup?.addListener(enableSidePanelOnAction);

export {};
