import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `npm run botmatch:series` (Erik, 2026-10-31: "simulera 20 matcher
 * mellan 2 bottar som spelar olika bra … byt storlek på planen, olika
 * inställningar, sammanställ sedan vad som behöver förbättras"): plays
 * `real-match` N times with a different skill pair, court, language and
 * bot colour each time (a fixed schedule, so a series can be rerun), then
 * reads each match's window of the debug log into one table.
 *   npm run botmatch:series -- [--matches 20] [--out <dir>] [--first 0]
 *     [--time-limit <min>] [--url <dev server>]
 */
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return (i > 0 ? process.argv[i + 1] : undefined) ?? fallback;
};
const MATCHES = Number(arg('matches', '20'));
/** Room time limit per match in minutes (0 = none). */
const TIME_LIMIT_MIN = arg('time-limit', '0');
const URL_ARG = arg('url', '');
const FIRST = Number(arg('first', '0'));
const OUT = arg('out', join(tmpdir(), 'kubb-series', String(Date.now())));
const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';
/** One match may run long with two weak players; never past this. */
const MATCH_TIMEOUT_S = 1800;

interface Plan {
  index: number;
  hostSpread: number;
  guestSpread: number;
  court: 'simple' | 'advanced';
  language: 'sv' | 'en';
  botColor: number;
}

/** Strong 0.15 m … weak 0.6 m; the pairs cycle out of step so every
 * kind of match turns up: even, lopsided either way, both weak. */
const HOST_SPREADS = [0.15, 0.3, 0.45, 0.6];
const GUEST_SPREADS = [0.6, 0.45, 0.3, 0.15, 0.3];

export function seriesPlan(i: number): Plan {
  return {
    index: i,
    hostSpread: HOST_SPREADS[i % HOST_SPREADS.length] ?? 0.3,
    guestSpread: GUEST_SPREADS[i % GUEST_SPREADS.length] ?? 0.3,
    court: i % 2 === 0 ? 'simple' : 'advanced',
    language: i % 3 === 2 ? 'en' : 'sv',
    // Every fourth match the bot wears A's colour: the clash rule's case.
    botColor: i % 4 === 0 ? 1 : 4,
  };
}

interface LogEntry {
  role?: string;
  channel?: string;
  message?: string;
  data?: Record<string, unknown>;
  receivedAt?: number;
  level?: string;
}

function logBetween(fromMs: number, toMs: number): LogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  const out: LogEntry[] = [];
  for (const raw of readFileSync(LOG_PATH, 'utf8').split('\n')) {
    if (!raw) continue;
    try {
      const e = JSON.parse(raw) as LogEntry;
      const at = e.receivedAt ?? 0;
      if (at >= fromMs && at <= toMs) out.push(e);
    } catch {
      // a torn line
    }
  }
  return out;
}

interface MatchRow {
  plan: Plan;
  result: string;
  minutes: number;
  rounds: number;
  winner: unknown;
  endReason: unknown;
  stickNumber: unknown;
  sticks: { host: number; guest: number };
  felled: { host: number; guest: number };
  inkast: { legal: number; out: number; secondTry: number; timedOut: number };
  raised: Record<string, number>;
  footFaults: number;
  heldBehindLine: number;
  warnings: number;
  pageErrors: number;
}

function analyse(plan: Plan, summaryPath: string): MatchRow | null {
  if (!existsSync(summaryPath)) return null;
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as {
    pageErrors: string[];
    scenarios: Array<{ result?: string; fromMs?: number; toMs?: number }>;
  };
  const sc = summary.scenarios[0];
  if (!sc?.fromMs || !sc.toMs) return null;
  const lines = logBetween(sc.fromMs, sc.toMs);
  const gate = (role: string, message: string) =>
    lines.filter(
      (e) => e.channel === 'gate' && e.role === role && e.message === message,
    );
  const king = gate('server', 'king decision')[0]?.data ?? {};
  const decidedAt = gate('server', 'king decision')[0]?.receivedAt ?? sc.toMs;
  const sticks = { host: 0, guest: 0 };
  const felled = { host: 0, guest: 0 };
  // Player A logs a summary for EVERY round, its own and the bot's.
  for (const e of gate('host', 'round summary')) {
    const thrower = e.data?.['matchTurn'] === 'guest' ? 'guest' : 'host';
    sticks[thrower] += Number(e.data?.['sticksThrown'] ?? 0);
    felled[thrower] += Number(e.data?.['kubbsFelled'] ?? 0);
  }
  const landed = gate('server', 'inkast landed');
  const raised: Record<string, number> = {};
  for (const e of gate('server', 'kubb raised')) {
    const reason = String(e.data?.['reason'] ?? '?');
    raised[reason] = (raised[reason] ?? 0) + 1;
  }
  return {
    plan,
    result: sc.result ?? '?',
    minutes: Math.round((decidedAt - sc.fromMs) / 6000) / 10,
    rounds: gate('server', 'round recorded').length,
    winner: king['winner'] ?? null,
    endReason: king['endReason'] ?? null,
    stickNumber: king['stickNumberInRound'] ?? null,
    sticks,
    felled,
    inkast: {
      legal: landed.filter((e) => e.data?.['legal'] === true).length,
      out: landed.filter((e) => e.data?.['legal'] === false).length,
      secondTry: landed.filter((e) => e.data?.['attempt'] === 2).length,
      timedOut: landed.filter((e) => e.data?.['timedOut'] === true).length,
    },
    raised,
    footFaults: gate('server', 'foot fault').length,
    heldBehindLine: gate('host', 'held behind line').length,
    warnings: lines.filter(
      (e) =>
        (e.level === 'warn' || e.level === 'error') &&
        e.message !== 'game server connection closed',
    ).length,
    pageErrors: summary.pageErrors.length,
  };
}

function table(rows: MatchRow[]): string {
  const pct = (a: number, b: number) =>
    b === 0 ? '-' : `${String(Math.round((100 * a) / b))}%`;
  const head =
    '| # | court | lang | aim A/B (m) | result | min | rounds | winner | how | A hit/stick | B hit/stick | inkast ok/out | raised (reason) | warn |';
  const sep = `|${'---|'.repeat(14)}`;
  const body = rows.map((r) =>
    [
      r.plan.index + 1,
      r.plan.court,
      r.plan.language,
      `${String(r.plan.hostSpread)}/${String(r.plan.guestSpread)}`,
      r.result,
      r.minutes,
      r.rounds,
      String(r.winner),
      `${String(r.endReason)}${r.stickNumber === 6 ? ' (6th)' : ''}`,
      pct(r.felled.host, r.sticks.host),
      pct(r.felled.guest, r.sticks.guest),
      `${String(r.inkast.legal)}/${String(r.inkast.out)}`,
      Object.entries(r.raised)
        .map(([k, v]) => `${k} ${String(v)}`)
        .join(', '),
      r.warnings + r.pageErrors,
    ].join(' | '),
  );
  return [head, sep, ...body.map((b) => `| ${b} |`)].join('\n');
}

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const rows: MatchRow[] = [];
  for (let i = FIRST; i < FIRST + MATCHES; i += 1) {
    const plan = seriesPlan(i);
    const summary = join(OUT, `match-${String(i + 1)}.json`);
    console.log(
      `${new Date().toTimeString().slice(0, 8)} match ${String(i + 1)}: ${JSON.stringify(plan)}`,
    );
    spawnSync(
      'npx',
      [
        'tsx',
        'tools/botmatch/main.ts',
        '--scenario',
        'real-match',
        '--fast',
        '--seed',
        String(100 + i),
        '--host-spread',
        String(plan.hostSpread),
        '--guest-spread',
        String(plan.guestSpread),
        '--court',
        plan.court,
        '--time-limit',
        TIME_LIMIT_MIN,
        ...(URL_ARG ? ['--url', URL_ARG] : []),
        '--language',
        plan.language,
        '--bot-color',
        String(plan.botColor),
        '--out',
        join(OUT, `match-${String(i + 1)}`),
        '--summary',
        summary,
      ],
      {
        stdio: ['ignore', 'inherit', 'inherit'],
        timeout: (MATCH_TIMEOUT_S + 120) * 1000,
        killSignal: 'SIGINT',
      },
    );
    const row = analyse(plan, summary);
    if (row) rows.push(row);
    writeFileSync(join(OUT, 'series.json'), JSON.stringify(rows, null, 2));
    writeFileSync(join(OUT, 'series.md'), `${table(rows)}\n`);
  }
  console.log(`\n${table(rows)}\n\nseries: ${OUT}`);
}

main();
