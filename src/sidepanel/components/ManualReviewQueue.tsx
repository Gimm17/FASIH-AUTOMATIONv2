import { useState } from 'react';
import type { ManualReviewItem } from '@shared/types';
import { sendToBackground } from '@shared/messages';

export function ManualReviewQueue({
  items,
  jobId,
  onResolved,
}: {
  items: ManualReviewItem[];
  jobId: string;
  onResolved: (rowNumber: number) => void;
}) {
  const [busyRow, setBusyRow] = useState<number | null>(null);

  const accept = async (item: ManualReviewItem, candidateCode: string) => {
    setBusyRow(item.rowNumber);
    try {
      await sendToBackground({
        type: 'JOB_ACCEPT_MANUAL',
        jobId,
        rowNumber: item.rowNumber,
        candidateCode,
      });
      onResolved(item.rowNumber);
    } finally {
      setBusyRow(null);
    }
  };

  return (
    <div>
      {items.map((item) => (
        <div key={item.rowNumber} style={{ marginBottom: 8 }}>
          <div>
            <b>Row {item.rowNumber}</b> · {item.targetName}
          </div>
          <div className="candidate-list">
            {item.candidates.map((c) => (
              <div key={c.candidate.cardCode} className="candidate">
                <span>
                  {c.candidate.cardName || '(tanpa nama)'}
                  <br />
                  <small>
                    skor {c.combinedScore.toFixed(2)} · {c.candidate.cardCode}
                  </small>
                </span>
                <button
                  disabled={busyRow === item.rowNumber}
                  onClick={() => void accept(item, c.candidate.cardCode)}
                >
                  Terima
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="muted" style={{ margin: 0 }}>
        Kandidat ambigu (skor di zona abu-abu). Terima hanya jika Anda yakin ini entitas yang sama —
        extraction ID akan dijalankan ulang untuk kandidat tersebut.
      </p>
    </div>
  );
}
