/// <reference types="node" />
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** The debug relay's NDJSON log (vite.config.ts kubbDebugRelay) — the
 * server writes its own lines there so `npm run gate:report` sees
 * server-side facts (king decisions, inkast landings, raises) next to
 * the headsets' lines. */
const LOG_PATH = resolve('.iwsdk/runtime/logs/kubb-debug.ndjson');

export type ServerLog = (
  level: 'info' | 'warn',
  channel: string,
  message: string,
  data: Record<string, unknown>,
) => void;

export const appendServerLog: ServerLog = (level, channel, message, data) => {
  const now = Date.now();
  try {
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    appendFileSync(
      LOG_PATH,
      JSON.stringify({
        level,
        channel,
        message,
        data,
        timeMs: now,
        client: 'server',
        role: 'server',
        receivedAt: now,
      }) + '\n',
    );
  } catch {
    // Diagnostics must never take the game server down.
  }
};

export const noServerLog: ServerLog = () => undefined;
