/**
 * Structured logger. In the service worker / content script it forwards log lines to the
 * side panel via chrome.runtime messaging + chrome.storage.session. In tests it falls back
 * to console. NEVER logs secrets, auth tokens, or full request dumps.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  /** Optional row context, e.g. 5 → "[ROW 5] ...". */
  row?: number;
}

export interface Logger {
  debug(message: string, ctx?: { row?: number }): void;
  info(message: string, ctx?: { row?: number }): void;
  warn(message: string, ctx?: { row?: number }): void;
  error(message: string, ctx?: { row?: number }): void;
  success(message: string, ctx?: { row?: number }): void;
}

function nowStamp(): string {
  // Use ISO for persistence; the UI formats the time portion.
  try {
    return new Date().toISOString();
  } catch {
    return '';
  }
}

function formatMessage(message: string, ctx?: { row?: number }): string {
  return ctx && typeof ctx.row === 'number' ? `[ROW ${ctx.row}] ${message}` : message;
}

/** Redaction patterns — strip anything that looks like a bearer token / api key before logging. */
const SECRET_PATTERNS: RegExp[] = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi,
  /sk-[A-Za-z0-9_\-]{6,}/gi,
  /[?&]api[_-]?key=[^&\s]+/gi,
  /Authorization:\s*[^\n]+/gi,
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const re of SECRET_PATTERNS) {
    out = out.replace(re, '[REDACTED]');
  }
  return out;
}

/**
 * Create a logger that emits to the chrome runtime (live) AND to console (fallback).
 * Safe to call in environments without chrome.runtime (tests, node).
 */
export function createLogger(sink?: (entry: LogEntry) => void): Logger {
  const emit = (level: LogLevel, message: string, ctx?: { row?: number }) => {
    const entry: LogEntry = {
      timestamp: nowStamp(),
      level,
      message: redactSecrets(formatMessage(message, ctx)),
      ...(ctx?.row !== undefined ? { row: ctx.row } : {}),
    };

    if (sink) {
      sink(entry);
      return;
    }

    // Default sink: try chrome.runtime (content script / sw), fall back to console.
    const fn =
      level === 'ERROR' || level === 'WARN'
        ? console.warn
        : level === 'SUCCESS' || level === 'INFO'
          ? console.log
          : console.debug;
    fn(`[${level}] ${entry.message}`);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
        chrome.runtime
          .sendMessage({ type: 'LOG', entry })
          .catch(() => {});
      }
    } catch {
      // ignore — running in a context without chrome
    }
  };

  return {
    debug: (m, c) => emit('DEBUG', m, c),
    info: (m, c) => emit('INFO', m, c),
    warn: (m, c) => emit('WARN', m, c),
    error: (m, c) => emit('ERROR', m, c),
    success: (m, c) => emit('SUCCESS', m, c),
  };
}

/** Singleton logger for non-React modules (matching engine, job engine, excel adapter). */
export const logger = createLogger();
