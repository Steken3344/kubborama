// Follow the debug relay's NDJSON file live, one readable line per entry.
// Usage: npm run debug:tail            (all clients, all channels)
//        npm run debug:tail -- net     (only the `net` channel)
//        npm run debug:tail -- guest   (only entries from the guest role)
// See src/debug/debugRelay.ts and the kubbDebugRelay plugin in
// vite.config.ts. The file lives under .iwsdk/ (gitignored).
import { Buffer } from 'node:buffer';
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { setInterval } from 'node:timers';

const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';
const filters = process.argv.slice(2);

function matches(entry) {
  if (filters.length === 0) return true;
  const hay = `${entry.role} ${entry.client} ${entry.channel} ${entry.level}`;
  return filters.some((f) => hay.includes(f));
}

function format(entry) {
  const t = new Date(entry.timeMs).toISOString().slice(11, 23);
  const data = entry.data === undefined ? '' : JSON.stringify(entry.data);
  const who = `${entry.role}/${entry.client}`.padEnd(12);
  return `${t} ${who} ${String(entry.level).padEnd(5)} [${entry.channel}] ${entry.message} ${data}`;
}

if (!existsSync(LOG_PATH)) {
  console.log(
    `No ${LOG_PATH} yet — start the dev server and open the app with ?debug=1 (or the settings-tab Debug button).`,
  );
}
let offset = existsSync(LOG_PATH) ? statSync(LOG_PATH).size : 0;
let partial = '';
console.log(
  `tailing ${LOG_PATH}${filters.length ? ` (filter: ${filters.join(', ')})` : ''} — Ctrl+C to stop`,
);

setInterval(() => {
  if (!existsSync(LOG_PATH)) return;
  const size = statSync(LOG_PATH).size;
  if (size < offset) {
    offset = 0; // truncated — start over, drop any half line
    partial = '';
  }
  if (size === offset) return;
  const buf = Buffer.alloc(size - offset);
  const fd = openSync(LOG_PATH, 'r');
  let bytesRead;
  try {
    bytesRead = readSync(fd, buf, 0, buf.length, offset);
  } finally {
    closeSync(fd); // one fd per poll, released every time (no EMFILE)
  }
  offset += bytesRead;
  const text = partial + buf.subarray(0, bytesRead).toString('utf8');
  const lines = text.split('\n');
  partial = lines.pop() ?? '';
  for (const line of lines) {
    if (!line) continue;
    try {
      const entry = JSON.parse(line);
      if (matches(entry)) console.log(format(entry));
    } catch {
      console.log(line);
    }
  }
}, 250);
