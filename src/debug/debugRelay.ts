import { log, setLogSink } from '../core/log.js';
import type { LogEntry } from '../core/log.js';
import { debugContext } from './debugContext.js';

/** Where the dev server's kubbDebugRelay plugin (vite.config.ts) listens. */
export const DEBUG_RELAY_PATH = '/__kubb/log';
const FLUSH_INTERVAL_MS = 250;
const MAX_BATCH = 200;

interface ShippedEntry extends LogEntry {
  client: string;
  role: string;
}

let batch: ShippedEntry[] = [];
let flushTimer: number | null = null;
let listenersInstalled = false;

/**
 * Debug mode transport (Erik, 2026-09-05). The Quest browser hides its
 * console from remote devtools and IWSDK's MCP bridge only reaches the
 * managed desktop browser (docs/DECISIONS.md 2026-09-03), so the only way
 * to watch a headset live is for the APP to ship its log lines to the
 * dev server it is already loading from — over `adb reverse` (USB) or
 * the Wi-Fi LAN URL alike. Both headsets can post to the same server and
 * every line carries the client id + host/guest role, so the two
 * timelines interleave in one file.
 *
 * Switched on by `?debug=1` in the URL (checked at boot, before anything
 * logs) or by the settings-tab "Debug" button (settings.debugRelay,
 * applied by SettingsSystem after loading). Dev build only
 * (`import.meta.env.DEV`): the production bundle has no relay to talk to
 * and never ships anything. Batched every 250 ms, fire-and-forget; a
 * failing POST is dropped silently — the game must never stall on its
 * own diagnostics.
 */
export function installDebugRelay(): void {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') === '1') {
    enableDebugRelay();
  }
}

export function enableDebugRelay(): void {
  if (!import.meta.env.DEV || debugContext.enabled) {
    return;
  }
  debugContext.enabled = true;
  setLogSink((entry) => {
    batch.push({
      ...entry,
      client: debugContext.clientId,
      role: debugContext.role,
    });
    if (batch.length >= MAX_BATCH) {
      flush();
    }
  });
  flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS);
  if (!listenersInstalled) {
    listenersInstalled = true;
    window.addEventListener('pagehide', flush);
    // Nothing may fail silently while we are hunting bugs.
    window.addEventListener('error', (event) => {
      log('error', 'debug', 'uncaught error', {
        message: event.message,
        source: `${event.filename}:${event.lineno}:${event.colno}`,
      });
    });
    window.addEventListener('unhandledrejection', (event) => {
      log('error', 'debug', 'unhandled promise rejection', {
        reason: String(event.reason),
      });
    });
  }
  log('info', 'debug', 'debug relay active', {
    client: debugContext.clientId,
    url: window.location.href,
    userAgent: navigator.userAgent,
  });
}

export function disableDebugRelay(): void {
  if (!debugContext.enabled) {
    return;
  }
  log('info', 'debug', 'debug relay stopping', {});
  flush();
  setLogSink(null);
  if (flushTimer !== null) {
    window.clearInterval(flushTimer);
    flushTimer = null;
  }
  debugContext.enabled = false;
}

function flush(): void {
  if (batch.length === 0) {
    return;
  }
  const payload = JSON.stringify(batch);
  batch = [];
  void fetch(DEBUG_RELAY_PATH, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
