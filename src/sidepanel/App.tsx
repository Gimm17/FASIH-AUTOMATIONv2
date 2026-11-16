import { useCallback, useEffect, useState } from 'react';
import type { ExtensionSettings, JobState, ManualReviewItem, RowResult } from '@shared/types';
import type { LogEntry } from '@shared/logger';
import type { ExtensionMessage, SubscribeResult } from '@shared/messages';
import { sendToBackground } from '@shared/messages';
import { FilePicker } from './components/FilePicker';
import { ConnectionStatus } from './components/ConnectionStatus';
import { RunControls } from './components/RunControls';
import { ProgressTable } from './components/ProgressTable';
import { LogPanel } from './components/LogPanel';
import { SettingsForm } from './components/SettingsForm';
import { ManualReviewQueue } from './components/ManualReviewQueue';

export function App() {
  const [job, setJob] = useState<JobState | null>(null);
  const [results, setResults] = useState<RowResult[]>([]);
  const [manualReviews, setManualReviews] = useState<ManualReviewItem[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [fasihStatus, setFasihStatus] = useState<'connected' | 'not_found' | 'login_required' | 'unknown'>('unknown');
  const [aiStatus, setAiStatus] = useState<{ status: 'connected' | 'error' | 'disabled'; detail?: string }>({ status: 'disabled' });

  const upsertResult = useCallback((result: RowResult) => {
    setResults((prev) => {
      const idx = prev.findIndex((r) => r.rowNumber === result.rowNumber);
      if (idx === -1) return [...prev, result];
      const next = [...prev];
      next[idx] = result;
      return next;
    });
  }, []);

  // Bootstrap: subscribe to telemetry + load settings.
  useEffect(() => {
    sendToBackground<SubscribeResult>({ type: 'SUBSCRIBE_TELEMETRY' })
      .then((snapshot) => {
        setJob(snapshot.job);
        setResults(snapshot.results);
        setManualReviews(snapshot.manualReviews);
      })
      .catch(() => {});
    sendToBackground<ExtensionSettings>({ type: 'GET_SETTINGS' })
      .then(setSettings)
      .catch(() => {});
  }, []);

  // Live telemetry stream from the service worker.
  useEffect(() => {
    const listener = (message: ExtensionMessage) => {
      switch (message.type) {
        case 'LOG':
          setLogs((prev) => [...prev.slice(-499), message.entry]);
          break;
        case 'PROGRESS':
        case 'JOB_UPDATED':
          setJob(message.job);
          break;
        case 'ROW_RESULT':
          upsertResult(message.result);
          break;
        case 'MANUAL_REVIEW':
          setManualReviews((prev) => [...prev.filter((m) => m.rowNumber !== message.item.rowNumber), message.item]);
          break;
        case 'FASIH_STATUS':
          setFasihStatus(message.status);
          break;
        case 'AI_STATUS':
          setAiStatus({ status: message.status, detail: message.detail });
          break;
        default:
          break;
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [upsertResult]);

  const onUploaded = (uploadedJob: JobState) => {
    setJob(uploadedJob);
    setResults([]);
    setManualReviews([]);
  };

  return (
    <div className="panel">
      <ConnectionStatus fasih={fasihStatus} ai={aiStatus} />

      <div className="card">
        <h2>1 · File Excel</h2>
        <FilePicker onJobReady={onUploaded} currentJob={job} />
      </div>

      <div className="card">
        <h2>2 · Jalankan</h2>
        <RunControls job={job} onJobUpdated={setJob} />
      </div>

      {manualReviews.length > 0 && (
        <div className="card">
          <h2>Manual Review ({manualReviews.length})</h2>
          <ManualReviewQueue items={manualReviews} jobId={job?.id ?? ''} onResolved={(rowNumber) => setManualReviews((prev) => prev.filter((m) => m.rowNumber !== rowNumber))} />
        </div>
      )}

      <div className="card">
        <h2>Hasil</h2>
        <ProgressTable job={job} results={results} />
      </div>

      <div className="card">
        <h2>Log</h2>
        <LogPanel logs={logs} />
      </div>

      <div className="card">
        <h2>Pengaturan</h2>
        {settings ? (
          <SettingsForm initial={settings} onSaved={setSettings} />
        ) : (
          <span className="muted">memuat…</span>
        )}
      </div>
    </div>
  );
}
