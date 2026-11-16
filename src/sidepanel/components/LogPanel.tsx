import { useEffect, useRef } from 'react';
import type { LogEntry } from '@shared/logger';

export function LogPanel({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [logs.length]);

  if (logs.length === 0) {
    return <p className="muted" style={{ margin: 0 }}>Log akan muncul saat job berjalan.</p>;
  }

  return (
    <div className="log">
      {logs.map((entry, i) => (
        <div key={`${entry.timestamp}-${i}`} className={entry.level}>
          <span className="time">{new Date(entry.timestamp).toLocaleTimeString()} </span>
          {entry.message}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
