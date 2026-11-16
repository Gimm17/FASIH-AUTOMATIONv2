import type { JobState, RowResult } from '@shared/types';

export function ProgressTable({ job, results }: { job: JobState | null; results: RowResult[] }) {
  const sorted = [...results].sort((a, b) => a.rowNumber - b.rowNumber);

  return (
    <div>
      {job && (
        <div className="stats" style={{ marginBottom: 8 }}>
          <div className="stat"><b>{job.successCount}</b><span>DONE</span></div>
          <div className="stat"><b>{job.noMatchCount}</b><span>NO MATCH</span></div>
          <div className="stat"><b>{job.manualReviewCount}</b><span>MANUAL</span></div>
          <div className="stat"><b>{job.errorCount}</b><span>ERROR</span></div>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>Belum ada hasil — mulai job untuk melihat progres per baris.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 34 }}>Row</th>
              <th>Target</th>
              <th style={{ width: 100 }}>Status</th>
              <th>Duplikat</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.rowNumber}>
                <td className="mono">{r.rowNumber}</td>
                <td>{r.targetName}</td>
                <td className={`status-${r.status}`}>{r.status}</td>
                <td className="mono">
                  {r.duplicates.length === 0
                    ? r.error ? <span title={r.error}>⚠ lihat log</span> : '—'
                    : r.duplicates.map((d) => (
                        <div key={d.assignmentId} title={d.candidateName}>
                          {d.assignmentId.slice(0, 8)}… · {d.candidateName || d.candidateCode}
                        </div>
                      ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
