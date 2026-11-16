import type { JobState } from '@shared/types';
import { sendToBackground } from '@shared/messages';
import type { DownloadResult } from '@shared/messages';

export function RunControls({
  job,
  onJobUpdated,
}: {
  job: JobState | null;
  onJobUpdated: (job: JobState) => void;
}) {
  const status = job?.status ?? 'none';
  const running = status === 'RUNNING';

  const send = (message: Parameters<typeof sendToBackground>[0]) =>
    sendToBackground(message).catch(() => {});

  const start = () => {
    if (!job) return;
    onJobUpdated({ ...job, status: 'RUNNING' });
    void send({ type: 'JOB_START', jobId: job.id });
  };

  const download = async () => {
    if (!job) return;
    const result = await sendToBackground<DownloadResult>({ type: 'DOWNLOAD_OUTPUT', payload: { jobId: job.id } });
    if (!result.ok) window.alert(`Download gagal: ${result.error}`);
  };

  const hasResults = (job?.successCount ?? 0) + (job?.noMatchCount ?? 0) + (job?.errorCount ?? 0) + (job?.manualReviewCount ?? 0) > 0;

  return (
    <div>
      <div className="row">
        <button className="primary" disabled={!job || running || status === 'DONE'} onClick={start}>
          Start
        </button>
        <button disabled={!running} onClick={() => void send({ type: 'JOB_PAUSE' })}>Pause</button>
        <button disabled={status !== 'PAUSED'} onClick={() => void send({ type: 'JOB_RESUME' })}>Resume</button>
        <button className="danger" disabled={!running && status !== 'PAUSED'} onClick={() => void send({ type: 'JOB_STOP' })}>Stop</button>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button disabled={(job?.errorCount ?? 0) === 0 || running} onClick={() => void send({ type: 'JOB_RETRY_ERRORS' })}>
          Ulangi baris error ({job?.errorCount ?? 0})
        </button>
        <button className="primary" disabled={!job || !hasResults} onClick={() => void download()}>
          Unduh Excel Hasil
        </button>
      </div>

      {job && (
        <div style={{ marginTop: 10 }}>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${job.targetCount ? Math.round((job.processedCount / job.targetCount) * 100) : 0}%` }}
            />
          </div>
          <span className="muted">
            {job.processedCount}/{job.targetCount} baris · status {job.status}
          </span>
        </div>
      )}
      {!job && <p className="muted" style={{ margin: '8px 0 0' }}>Upload file Excel dulu untuk memulai.</p>}
    </div>
  );
}
