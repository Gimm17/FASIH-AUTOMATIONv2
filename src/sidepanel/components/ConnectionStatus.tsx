import { sendToBackground } from '@shared/messages';

export function ConnectionStatus({
  fasih,
  ai,
}: {
  fasih: 'connected' | 'not_found' | 'login_required' | 'unknown';
  ai: { status: 'connected' | 'error' | 'disabled'; detail?: string };
}) {
  const refresh = () => {
    void sendToBackground({ type: 'FASIH_PING_TAB' }).catch(() => {});
    void sendToBackground({ type: 'AI_TEST_CONNECTION' }).catch(() => {});
  };

  const fasihBadge =
    fasih === 'connected' ? { cls: 'ok', label: 'FASIH terhubung' }
    : fasih === 'login_required' ? { cls: 'err', label: 'FASIH perlu login' }
    : fasih === 'not_found' ? { cls: 'warn', label: 'Tab FASIH tidak ditemukan' }
    : { cls: '', label: 'FASIH memeriksa…' };

  const aiBadge =
    ai.status === 'connected' ? { cls: 'ok', label: 'AI gateway siap' }
    : ai.status === 'error' ? { cls: 'err', label: `AI error${ai.detail ? `: ${ai.detail}` : ''}` }
    : { cls: 'warn', label: 'AI nonaktif' };

  return (
    <div className="row">
      <span className={`badge ${fasihBadge.cls}`}><span className="dot" />{fasihBadge.label}</span>
      <span className={`badge ${aiBadge.cls}`}><span className="dot" />{aiBadge.label}</span>
      <button onClick={refresh} style={{ marginLeft: 'auto' }}>Refresh</button>
    </div>
  );
}
