/**
 * Structured logger — no raw console.log anywhere in the app. Every
 * message carries a level and a channel tag ([throw], [physics],
 * [grab], [state], [audio], [net], [i18n], [settings]), matching
 * browser_get_console_logs's pattern filtering. A ring buffer feeds the
 * in-VR debug overlay and the debug-report export.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogChannel =
  | 'throw'
  | 'physics'
  | 'grab'
  | 'state'
  | 'audio'
  | 'net'
  | 'i18n'
  | 'settings'
  | 'match'
  | 'avatar'
  | 'debug';

export interface LogEntry {
  level: LogLevel;
  channel: LogChannel;
  message: string;
  data: unknown;
  timeMs: number;
}

export const MAX_LOG_ENTRIES = 200;

const ring: LogEntry[] = [];

export type LogSink = (entry: LogEntry) => void;
let sink: LogSink | null = null;

/** Debug mode (2026-09-05, Erik: "lägg in ett debugläge"): a second
 * consumer for every entry besides the console — src/debug/debugRelay.ts
 * ships them to the dev server, since the Quest browser's console is
 * unreachable from outside. Pure core stays ignorant of HOW they travel. */
export function setLogSink(next: LogSink | null): void {
  sink = next;
}

function consoleFn(level: LogLevel): (...args: unknown[]) => void {
  if (level === 'error') return console.error;
  if (level === 'warn') return console.warn;
  return console.log;
}

export function log(
  level: LogLevel,
  channel: LogChannel,
  message: string,
  data?: unknown,
): void {
  const entry: LogEntry = { level, channel, message, data, timeMs: Date.now() };
  ring.push(entry);
  if (ring.length > MAX_LOG_ENTRIES) {
    ring.shift();
  }
  consoleFn(level)(`[${channel}]`, message, data ?? '');
  sink?.(entry);
}

export function getRecentLogs(count = 20): LogEntry[] {
  return ring.slice(Math.max(0, ring.length - count));
}
