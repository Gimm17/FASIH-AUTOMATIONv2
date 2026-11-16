import { useState } from 'react';
import type { ExtensionSettings } from '@shared/types';
import { sendToBackground } from '@shared/messages';

/** Local editable copy; Save persists via SET_SETTINGS (deep-merged over defaults in the SW). */
export function SettingsForm({ initial, onSaved }: { initial: ExtensionSettings; onSaved: (s: ExtensionSettings) => void }) {
  const [draft, setDraft] = useState<ExtensionSettings>(initial);
  const [saved, setSaved] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const patch = (mutate: (d: ExtensionSettings) => void) => {
    const next = structuredClone(draft);
    mutate(next);
    setDraft(next);
    setSaved(false);
  };

  const save = async () => {
    await sendToBackground({ type: 'SET_SETTINGS', settings: draft });
    onSaved(draft);
    setSaved(true);
  };

  return (
    <div>
      <div className="row">
        <label className="row" style={{ gap: 4 }}>
          <input
            type="checkbox"
            checked={draft.ai.enabled}
            onChange={(e) => patch((d) => { d.ai.enabled = e.target.checked; })}
          />
          AI aktif (koreksi typo + kandidat ambigu)
        </label>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <label style={{ flex: 1 }}>
          <span className="muted">Gateway URL</span>
          <input
            type="text"
            value={draft.ai.baseUrl}
            onChange={(e) => patch((d) => { d.ai.baseUrl = e.target.value; })}
          />
        </label>
        <label style={{ flex: 1 }}>
          <span className="muted">Model utama</span>
          <input
            type="text"
            value={draft.ai.primaryModel}
            onChange={(e) => patch((d) => { d.ai.primaryModel = e.target.value; })}
          />
        </label>
      </div>

      <div className="row" style={{ marginTop: 6 }}>
        <label style={{ width: 90 }}>
          <span className="muted">Auto-accept</span>
          <input
            type="number"
            step="0.01"
            min="0.5"
            max="1"
            value={draft.matching.autoAcceptThreshold}
            onChange={(e) => patch((d) => { d.matching.autoAcceptThreshold = Number(e.target.value); })}
          />
        </label>
        <label style={{ width: 90 }}>
          <span className="muted">AI review</span>
          <input
            type="number"
            step="0.01"
            min="0.3"
            max="1"
            value={draft.matching.aiReviewThreshold}
            onChange={(e) => patch((d) => { d.matching.aiReviewThreshold = Number(e.target.value); })}
          />
        </label>
        <label className="row" style={{ gap: 4, marginTop: 14 }}>
          <input
            type="checkbox"
            checked={draft.excel.reprocessCompleted}
            onChange={(e) => patch((d) => { d.excel.reprocessCompleted = e.target.checked; })}
          />
          Proses ulang baris yang sudah ada output
        </label>
      </div>

      <div className="row" style={{ marginTop: 8 }}>
        <button className="primary" onClick={() => void save()}>Simpan</button>
        {saved && <span style={{ color: 'var(--ok)' }}>tersimpan ✓</span>}
        <button style={{ marginLeft: 'auto' }} onClick={() => setShowAdvanced((v) => !v)}>
          {showAdvanced ? 'Sembunyikan' : 'Lanjutan'}
        </button>
      </div>

      {showAdvanced && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="row">
            <label style={{ width: 90 }}>
              <span className="muted">Fallback model</span>
              <input
                type="text"
                value={draft.ai.fallbackModel ?? ''}
                onChange={(e) => patch((d) => { d.ai.fallbackModel = e.target.value || undefined; })}
              />
            </label>
            <label style={{ width: 90 }}>
              <span className="muted">AI timeout (ms)</span>
              <input
                type="number"
                step="500"
                value={draft.ai.timeoutMs}
                onChange={(e) => patch((d) => { d.ai.timeoutMs = Number(e.target.value); })}
              />
            </label>
            <label style={{ width: 90 }}>
              <span className="muted">AI confidence</span>
              <input
                type="number"
                step="0.05"
                min="0.5"
                max="1"
                value={draft.matching.aiAcceptConfidence}
                onChange={(e) => patch((d) => { d.matching.aiAcceptConfidence = Number(e.target.value); })}
              />
            </label>
          </div>
          <div className="row">
            <label style={{ width: 110 }}>
              <span className="muted">Max query/target</span>
              <input
                type="number"
                min="1"
                max="10"
                value={draft.search.maxQueriesPerTarget}
                onChange={(e) => patch((d) => { d.search.maxQueriesPerTarget = Number(e.target.value); })}
              />
            </label>
            <label style={{ width: 110 }}>
              <span className="muted">Scroll max passes</span>
              <input
                type="number"
                min="5"
                max="200"
                value={draft.scroll.maxPasses}
                onChange={(e) => patch((d) => { d.scroll.maxPasses = Number(e.target.value); })}
              />
            </label>
            <label style={{ width: 110 }}>
              <span className="muted">Separator duplikat</span>
              <input
                type="text"
                maxLength={3}
                value={draft.excel.duplicateSeparator}
                onChange={(e) => patch((d) => { d.excel.duplicateSeparator = e.target.value; })}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
