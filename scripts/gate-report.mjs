// Prints the headset-gate checklist from the debug relay log.
// Usage: npm run gate:report [-- --since HH:MM] [-- --watch]
// See docs/superpowers/specs/2026-09-26-gate-report-design.md.
import { existsSync, readFileSync } from 'node:fs';
import { parseLog, runChecks } from './gate/checks.mjs';

const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';
const args = process.argv.slice(2);
const sinceArg = args.includes('--since')
  ? args[args.indexOf('--since') + 1]
  : null;
const watch = args.includes('--watch');

function sinceMs() {
  if (!sinceArg) return 0;
  const [h, m] = sinceArg.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

function render() {
  if (!existsSync(LOG_PATH)) {
    console.log(
      `No ${LOG_PATH} — start the dev server and open the app with ?debug=1.`,
    );
    return;
  }
  const from = sinceMs();
  const entries = parseLog(readFileSync(LOG_PATH, 'utf8')).filter(
    (e) => (e.receivedAt ?? e.timeMs) >= from,
  );
  const clients = new Set(entries.map((e) => `${e.role}/${e.client}`));
  console.log(
    `gate report — ${entries.length} entries, clients: ${[...clients].join(', ') || 'none'}\n`,
  );
  const results = runChecks(entries);
  const order = { FAIL: 0, 'NOT SEEN': 1, PASS: 2, EYES: 3 };
  for (const r of [...results].sort(
    (a, b) => order[a.status] - order[b.status],
  )) {
    console.log(
      `${r.status.padEnd(8)} ${r.id.padEnd(18)} ${r.label}${r.evidence ? `\n         ${r.evidence}` : ''}`,
    );
  }
}

if (watch) {
  const tick = () => {
    console.clear();
    render();
  };
  tick();
  setInterval(tick, 2000);
} else {
  render();
}
