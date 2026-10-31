import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aimRelease, flightTimeFor } from '../../src/core/aim.js';
import type { MatchSide } from '../../src/core/match.js';
import type { Vec3 } from '../../src/core/vec3.js';
import { BrowserPlayer } from './browserPlayer.js';
import { isFreshMatch, jitter, planInkast, planStick } from './policy.js';
import { createRng } from '../../src/core/rng.js';
import type { PolicyView, ThrowPlan } from './policy.js';
import { ProtocolBot, throwMessage } from './protocolBot.js';
import { SCENARIOS } from './scenarios.js';
import type { Evidence, Scenario } from './scenarios.js';

/**
 * `npm run botmatch` (docs/superpowers/specs/2026-10-31-bot-match-and-
 * play-sessions-design.md): player A in a browser, player B as a
 * protocol bot, a spectator filming — scripted rule cases against the
 * dev game server, then a report. Usage:
 *   npm run botmatch -- [--scenario <name>|all] [--url <base>] [--out <dir>]
 *                       [--spread 0.3] [--seed 1]
 */
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  const value = i > 0 ? process.argv[i + 1] : undefined;
  return value ?? fallback;
};
const BASE = arg('url', 'https://localhost:8081/');
const WHICH = arg('scenario', 'all');
/** Aim spread for aimed sticks (m) and its seed: 0 aims perfectly.
 * The default makes bot matches look like real ones — misses, near
 * hits — instead of a kubb per stick. */
const SPREAD_M = Number(arg('spread', '0.3'));
const SEED = Number(arg('seed', '1'));
if (!Number.isFinite(SPREAD_M) || SPREAD_M < 0 || !Number.isInteger(SEED)) {
  console.error('--spread takes metres (>= 0), --seed an integer');
  process.exit(2);
}
/** The debug relay batches client lines: wait this long after a state
 * change before trusting the log has caught up. */
const RELAY_LAG_MS = 1500;
const OUT = arg('out', join(tmpdir(), 'kubb-botmatch', String(Date.now())));
const STICKS = [
  'stick-0',
  'stick-1',
  'stick-2',
  'stick-3',
  'stick-4',
  'stick-5',
];
const BETWEEN_STICKS_MS = 1500;
const AFTER_TOSS_MS = 4000;
const ROOM_GAP_MS = 1200;

/** Everything to tear down if the run dies half-way (no orphans). */
const cleanups: Array<() => void | Promise<void>> = [];
async function cleanUp(): Promise<void> {
  for (const fn of cleanups.splice(0).reverse()) {
    try {
      await fn();
    } catch {
      // already gone
    }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toTimeString().slice(0, 8);
const say = (text: string) => {
  console.log(`${stamp()} ${text}`);
};

/** Head-over-heels spin about x, the sign following the throw. */
const spinFor = (side: MatchSide): Vec3 => [side === 'host' ? -22 : 22, 0, 0];

function velocityFor(plan: ThrowPlan): Vec3 {
  return aimRelease(
    plan.from,
    plan.target,
    flightTimeFor(plan.from, plan.target, plan.speedMps),
  );
}

async function runScenario(
  scenario: Scenario,
  host: BrowserPlayer,
  bot: ProtocolBot,
  rng: () => number,
): Promise<{ result: 'done' | 'timeout'; fromMs: number }> {
  say(`scenario ${scenario.name}`);
  // Start from a fresh match the SERVER confirms, not after a guessed
  // sleep, and open the evidence window only after the setup reset's own
  // lines have landed (review, 2026-10-31).
  const before = bot.matchMessages;
  await host.room({ kind: 'reset' });
  for (
    let i = 0;
    i < 40 && !(bot.matchMessages > before && isFreshMatch(bot.match));
    i += 1
  ) {
    await sleep(250);
  }
  await sleep(RELAY_LAG_MS);
  bot.notices.length = 0;
  bot.rooms.length = 0;
  bot.phases.length = 0;
  const fromMs = Date.now();
  const startedMs = fromMs;
  let turnKey = '';
  let turnIndex = -1;
  const thrown = new Set<string>();
  const tossed = new Set<string>();
  const roomActions = [...(scenario.roomActions ?? [])];
  while (Date.now() - startedMs < scenario.timeBoxS * 1000) {
    if (scenario.done(bot)) return { result: 'done', fromMs };
    const state = bot.match;
    if (!state || state.winner !== null) {
      await sleep(250);
      continue;
    }
    const key = `${state.currentTurn}/${state.phase}`;
    if (key !== turnKey) {
      turnKey = key;
      turnIndex += 1;
      thrown.clear();
      // The same kubb can come back to be tossed by the other side with
      // the same attempt number (a felled field kubb): remember tosses per
      // turn only — a run once waited forever on the host's inkast.
      tossed.clear();
      await sleep(1200); // the server re-racks the sticks
      continue;
    }
    const action = roomActions.shift();
    if (action) {
      if (action.by === 'host') {
        await host.room(
          action.kind === 'reset'
            ? { kind: 'reset' }
            : {
                kind: 'court',
                gameMode: bot.gameMode === 'simple' ? 'advanced' : 'simple',
              },
        );
      } else if (action.kind === 'reset') {
        bot.send({ type: 'reset' });
      }
      await sleep(ROOM_GAP_MS);
      continue;
    }
    const side = state.currentTurn;
    const view: PolicyView = {
      state,
      halves: bot.halves,
      positions: bot.positions,
      racked: STICKS.filter((id) => !thrown.has(id)),
    };
    if (state.phase === 'inkast') {
      const next = state.inkastQueue[0];
      const tossKey = next ? `${next.kubbId}:${next.attempt}` : '';
      const plan = next
        ? planInkast(view, scenario.legalInkast(side, next.attempt))
        : null;
      if (!plan || tossed.has(tossKey)) {
        await sleep(250);
        continue;
      }
      tossed.add(tossKey);
      const velocity = velocityFor(plan);
      if (side === 'host') {
        await host.tossKubb(plan.pieceId, plan.from, velocity);
      } else {
        bot.send(
          throwMessage({
            pieceId: plan.pieceId,
            from: plan.from,
            velocity,
            spin: [0, 0, 0],
          }),
        );
      }
      await sleep(AFTER_TOSS_MS);
      continue;
    }
    const intent = scenario.intent(side, thrown.size, turnIndex);
    const plan = planStick(view, intent);
    if (!plan) {
      await sleep(250); // all six out: the server ends the turn
      continue;
    }
    thrown.add(plan.pieceId);
    const aimed =
      intent === 'hit' || intent === 'king'
        ? { ...plan, target: jitter(plan.target, rng, SPREAD_M) }
        : plan;
    const velocity = velocityFor(aimed);
    if (side === 'host') {
      await host.throwStick(plan.pieceId, plan.from, velocity, spinFor(side));
    } else {
      bot.send(
        throwMessage({
          pieceId: plan.pieceId,
          from: plan.from,
          velocity,
          spin: spinFor(side),
        }),
      );
    }
    await sleep(BETWEEN_STICKS_MS);
  }
  return { result: scenario.done(bot) ? 'done' : 'timeout', fromMs };
}

const LOG_PATH = '.iwsdk/runtime/logs/kubb-debug.ndjson';

interface LogEntry {
  role?: string;
  channel?: string;
  message?: string;
  data?: Record<string, unknown>;
  receivedAt?: number;
}

/** The debug log's lines received in [fromMs, toMs]. */
function logLines(fromMs: number, toMs: number): LogEntry[] {
  if (!existsSync(LOG_PATH)) return [];
  const lines: LogEntry[] = [];
  for (const raw of readFileSync(LOG_PATH, 'utf8').split('\n')) {
    if (!raw) continue;
    try {
      const e = JSON.parse(raw) as LogEntry;
      const at = e.receivedAt ?? 0;
      if (at >= fromMs && at <= toMs) lines.push(e);
    } catch {
      // a torn last line while the relay writes
    }
  }
  return lines;
}

const found = (lines: LogEntry[], ev: Evidence): boolean =>
  lines.some(
    (e) =>
      e.channel === 'gate' &&
      e.role === ev.role &&
      e.message === ev.message &&
      (ev.test?.(e.data ?? {}) ?? true),
  );

/** The gate report's FAIL rows, for information: in a bot match the
 * guest has no client log, so checks needing both headsets can fail
 * without a game bug. */
function gateFails(sinceHHMM: string): string[] {
  const result = spawnSync(
    'node',
    ['scripts/gate-report.mjs', '--since', sinceHHMM],
    { encoding: 'utf8' },
  );
  return result.stdout
    .split('\n')
    .map((line) => /^FAIL\s+(\S+)/u.exec(line)?.[1])
    .filter((id): id is string => id !== undefined);
}

async function main(): Promise<void> {
  const chosen =
    WHICH === 'all' ? SCENARIOS : SCENARIOS.filter((s) => s.name === WHICH);
  if (chosen.length === 0) {
    console.error(
      `unknown scenario ${WHICH}: ${SCENARIOS.map((s) => s.name).join(', ')}`,
    );
    process.exit(2);
  }
  mkdirSync(OUT, { recursive: true });
  const sinceHHMM = new Date().toTimeString().slice(0, 5);
  const spectator = spawn(
    'node',
    [
      'scripts/spectate.mjs',
      '--url',
      BASE,
      '--out',
      join(OUT, 'spectator'),
      '--every',
      '20',
      '--on-cut',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  cleanups.push(() => {
    spectator.kill('SIGINT');
  });
  const host = await BrowserPlayer.open(BASE);
  cleanups.push(() => host.close());
  say('player A (browser) in');
  const bot = await ProtocolBot.connect(BASE, 'botmatch-guest-0001');
  cleanups.push(() => {
    bot.close();
  });
  for (let i = 0; i < 120 && bot.match?.currentTurn !== 'host'; i += 1) {
    await sleep(500);
  }
  if (bot.side !== 'guest' || !bot.match) {
    throw new Error(
      `no match: bot side ${String(bot.side)}, rejected ${String(bot.rejected)}`,
    );
  }
  say('player B (bot) in, match on');

  const rng = createRng(SEED);
  say(`aim spread ${String(SPREAD_M)} m, seed ${String(SEED)}`);
  const outcomes = new Map<
    string,
    { result: 'done' | 'timeout'; fromMs: number; toMs: number }
  >();
  for (const scenario of chosen) {
    const { result, fromMs } = await runScenario(scenario, host, bot, rng);
    // Lines can trail the event (the restart comes ~10 s after a win).
    await sleep(scenario.name === 'win' && result === 'done' ? 13000 : 2000);
    outcomes.set(scenario.name, { result, fromMs, toMs: Date.now() });
    await host.screenshot(join(OUT, `${scenario.name}-player-a.jpg`));
  }
  await cleanUp();
  await sleep(3000); // the debug relay flushes its last batch

  let failed = false;
  console.log('\nbot match report');
  for (const [i, scenario] of chosen.entries()) {
    const outcome = outcomes.get(scenario.name);
    if (!outcome) continue;
    // Trailing lines count, but never past where the next scenario began.
    const next = chosen[i + 1];
    const nextFromMs = next ? outcomes.get(next.name)?.fromMs : undefined;
    const lines = logLines(
      outcome.fromMs,
      Math.min(outcome.toMs + 5000, nextFromMs ?? Infinity),
    );
    const missing = scenario.evidence.filter((ev) => !found(lines, ev));
    // Seen but not proven by the logs is a game (or logging) bug.
    const row =
      outcome.result === 'timeout'
        ? 'NOT SEEN'
        : missing.length > 0
          ? 'FAIL'
          : 'PASS';
    failed ||= row === 'FAIL';
    const detail =
      missing.length > 0
        ? `missing: ${missing.map((ev) => ev.label).join(', ')}`
        : scenario.evidence.map((ev) => ev.label).join(', ');
    console.log(`${row.padEnd(9)}${scenario.name.padEnd(13)}${detail}`);
  }
  const fails = gateFails(sinceHHMM);
  if (fails.length > 0) {
    console.log(`gate report FAIL rows (info): ${fails.join(', ')}`);
  }
  if (host.errors.length > 0) {
    console.log(
      `page errors (player A): ${host.errors.slice(0, 5).join(' | ')}`,
    );
  }
  console.log(`screenshots: ${OUT}`);
  process.exit(failed ? 1 : 0);
}

// A plain `kill` must not orphan the spectator or the browsers either.
process.on('SIGTERM', () => {
  void cleanUp().finally(() => process.exit(143));
});
process.on('SIGINT', () => {
  void cleanUp().finally(() => process.exit(130));
});

main().catch(async (error: unknown) => {
  console.error(error);
  await cleanUp();
  process.exit(1);
});
