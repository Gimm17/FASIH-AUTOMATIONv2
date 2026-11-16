import { useRef, useState } from 'react';
import type { JobState } from '@shared/types';
import { sendToBackground } from '@shared/messages';
import type { UploadResult } from '@shared/messages';
import { originalFileStore } from '@persistence/db';

/**
 * Reads the workbook in the panel context, stores the ORIGINAL bytes to IndexedDB
 * (structure preservation), then asks the service worker to parse targets + create a job.
 */
export function FilePicker({ onJobReady, currentJob }: { onJobReady: (job: JobState) => void; currentJob: JobState | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const jobId = crypto.randomUUID();
      const bytes = await file.arrayBuffer();
      await originalFileStore.save({ jobId, fileName: file.name, bytes });
      const response = await sendToBackground<UploadResult>({ type: 'UPLOAD_WORKBOOK', jobId, fileName: file.name });
      if (!response.ok || !response.job) {
        setError(response.error ?? 'gagal memuat workbook');
        return;
      }
      onJobReady(response.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="row">
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void pick(file);
            e.target.value = '';
          }}
        />
        <button className="primary" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Memuat…' : 'Pilih file Excel'}
        </button>
        {currentJob && (
          <span className="muted">
            {currentJob.sourceFileName} · {currentJob.sheetName} · {currentJob.targetCount} baris target
          </span>
        )}
      </div>
      {error && <p style={{ color: 'var(--err)', margin: '8px 0 0' }}>{error}</p>}
      <p className="muted" style={{ marginBottom: 0 }}>
        Kolom wajib: <span className="mono">data1</span>, <span className="mono">code_identity</span>,{' '}
        <span className="mono">assignment_id_duplicate</span>, <span className="mono">nama_duplicate</span>.
        Struktur file asli dipertahankan; hanya kolom output yang diisi.
      </p>
    </div>
  );
}
