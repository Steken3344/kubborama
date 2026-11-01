import { standingLineZ } from '../../src/core/match.js';
import type { MatchSide } from '../../src/core/match.js';
import type { Vec3 } from '../../src/core/vec3.js';
import { ProtocolBot, throwMessage } from './protocolBot.js';

/**
 * `npx tsx tools/botmatch/edgeCases.ts [--url <server>]` (Erik,
 * 2026-11-01: "gör sånt som man inte tänker på, kasta åt fel håll, tappa
 * och sen plocka upp — skall inte räknas som ett kast — och andra
 * edge-cases"): two protocol players against a game server, each case
 * judged from what the server then reports (snapshots and match state).
 * Run it against a server nobody plays on — it presses Ny runda.
 */
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return (i > 0 ? process.argv[i + 1] : undefined) ?? fallback;
};
const BASE = arg('url', 'https://localhost:8444/');
const STICKS = [
  'stick-0',
  'stick-1',
  'stick-2',
  'stick-3',
  'stick-4',
  'stick-5',
];
/** The stick table's top is 0.95 m: a racked stick lies above this. */
const ON_TABLE_Y = 0.85;
/** The stone wall's inner face (src/data/stone-wall.json: 29.6 m outer
 * side, 0.5 m thick, centred on the origin). */
const WALL_INNER_M = 29.6 / 2 - 0.5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail = ''): void {
  results.push({ name, ok, detail });
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`,
  );
}
async function waitFor(cond: () => boolean, ms: number): Promise<boolean> {
  for (let t = 0; t < ms; t += 100) {
    if (cond()) return true;
    await sleep(100);
  }
  return cond();
}

const y = (bot: ProtocolBot, id: string) => bot.positions.get(id)?.[1] ?? NaN;
const fmt = (p: Vec3 | undefined) =>
  p ? `[${p.map((v) => v.toFixed(2)).join(', ')}]` : 'none';
const onTable = (bot: ProtocolBot, ids: readonly string[]) =>
  ids.filter((id) => y(bot, id) > ON_TABLE_Y);
/** +1 for the host (throws towards −z), −1 for the guest. */
const fwd = (side: MatchSide) => (side === 'host' ? 1 : -1);

function releaseAt(bot: ProtocolBot, side: MatchSide, x = 0.2): Vec3 {
  const state = bot.match;
  if (!state) throw new Error('no match');
  const lineZ = standingLineZ(state, side, bot.halves);
  return [x, 1, lineZ + 0.3 * fwd(side)];
}

function send(
  bot: ProtocolBot,
  pieceId: string,
  from: Vec3,
  velocity: Vec3,
  spin: Vec3 = [0, 0, 0],
): void {
  bot.send(throwMessage({ pieceId, from, velocity, spin }));
}

/** A throw that lands beside the court, short of everything. */
function missVelocity(side: MatchSide): Vec3 {
  return [2.5, 3, -5 * fwd(side)];
}

/** The opening turns (Erik, 2026-11-01: the starter throws only 2
 * sticks; the other 4 wait on the guest's table): checks the layout,
 * then both sides miss so the match proper starts at the host. */
async function playOpening(a: ProtocolBot, b: ProtocolBot): Promise<void> {
  const hostTable = STICKS.filter(
    (id) => y(a, id) > ON_TABLE_Y && (a.positions.get(id)?.[2] ?? 0) > 0,
  );
  const guestTable = STICKS.filter(
    (id) => y(a, id) > ON_TABLE_Y && (a.positions.get(id)?.[2] ?? 0) < -4,
  );
  check(
    'opening: the starter has 2 sticks, the other 4 wait on the guest table',
    hostTable.length === 2 && guestTable.length === 4,
    `host table ${hostTable.join(',')}; guest table ${guestTable.join(',')}`,
  );
  for (const id of hostTable) {
    send(a, id, releaseAt(a, 'host'), missVelocity('host'));
    await sleep(700);
  }
  const turned = await waitFor(() => a.match?.currentTurn === 'guest', 20000);
  await sleep(2500);
  check("opening: the turn passes after the starter's 2 sticks", turned);
  for (const id of STICKS) {
    send(b, id, releaseAt(b, 'guest'), missVelocity('guest'));
    await sleep(300);
  }
  await waitFor(() => a.match?.currentTurn === 'host', 25000);
  await sleep(2500);
}

async function freshMatch(a: ProtocolBot): Promise<void> {
  const before = a.matchMessages;
  a.send({ type: 'reset' });
  await waitFor(
    () =>
      a.matchMessages > before &&
      a.match?.currentTurn === 'host' &&
      a.match.phase === 'throwing' &&
      a.match.fieldKubbs.length === 0 &&
      a.match.winner === null,
    10000,
  );
  await sleep(2500); // sticks re-racked and settled
}

async function main(): Promise<void> {
  const a = await ProtocolBot.connect(BASE, 'edge-a-0001', 1);
  await waitFor(() => a.side !== null, 10000);
  let b = await ProtocolBot.connect(BASE, 'edge-b-0001', 4);
  await waitFor(() => b.side !== null && a.match !== null, 15000);
  console.log(`seated: a=${String(a.side)} b=${String(b.side)} ${a.gameMode}`);
  if (a.side !== 'host' || b.side !== 'guest') {
    throw new Error(
      'expected a=host, b=guest (is someone else on the server?)',
    );
  }
  await freshMatch(a);
  await playOpening(a, b);
  check(
    'after the opening: all six sticks on the host table',
    onTable(a, STICKS).length === 6,
    STICKS.map((id) => y(a, id).toFixed(2)).join(' '),
  );

  // 1. Pick up and put back: six slow "releases" are not throws.
  for (const id of STICKS) {
    send(a, id, a.positions.get(id) ?? releaseAt(a, 'host'), [0, -0.4, 0.2]);
  }
  await sleep(2500);
  check(
    'put back all six (0.45 m/s): still host turn, nothing thrown',
    a.match?.currentTurn === 'host' &&
      a.match.phase === 'throwing' &&
      onTable(a, STICKS).length === 6,
    `turn ${String(a.match?.currentTurn)}/${String(a.match?.phase)}, on table ${String(onTable(a, STICKS).length)}`,
  );

  // 2. Dropped at the line with a slow hand (1.4 m/s, under the 1.5 m/s throw floor).
  send(a, 'stick-0', releaseAt(a, 'host'), [0, -1.4, 0]);
  await sleep(1500);
  check(
    'drop at 1.4 m/s: not a throw, stick stays on the table',
    y(a, 'stick-0') > ON_TABLE_Y,
    `stick-0 ${fmt(a.positions.get('stick-0'))}`,
  );

  // 3. The other player throws out of turn.
  send(b, 'stick-1', releaseAt(b, 'guest'), missVelocity('guest'));
  await sleep(1500);
  check(
    'guest throws during host turn: refused',
    y(a, 'stick-1') > ON_TABLE_Y,
    `stick-1 ${fmt(a.positions.get('stick-1'))}`,
  );

  // 4. Throwing a kubb instead of a stick during the throwing phase.
  const kubbId = a.match?.baselineKubbs.guest[0] ?? 'kubb-0';
  const kubbBefore = a.positions.get(kubbId);
  send(a, kubbId, releaseAt(a, 'host'), [0, 3, -7]);
  await sleep(1500);
  const kubbAfter = a.positions.get(kubbId);
  check(
    'host throws a baseline kubb in the throwing phase: refused',
    !!kubbBefore &&
      !!kubbAfter &&
      Math.hypot(kubbAfter[0] - kubbBefore[0], kubbAfter[2] - kubbBefore[2]) <
        0.05,
    `${kubbId} ${fmt(kubbBefore)} → ${fmt(kubbAfter)}`,
  );

  // 5. Absurd speed (beyond the protocol's 30 m/s bound): dropped at the boundary.
  send(a, 'stick-1', releaseAt(a, 'host'), [0, 0, -400]);
  await sleep(1500);
  check(
    '400 m/s throw: rejected by the protocol bounds',
    y(a, 'stick-1') > ON_TABLE_Y,
    `stick-1 ${fmt(a.positions.get('stick-1'))}`,
  );

  // 6. Wrong way: backwards over the shoulder, hard (it counts as a throw).
  send(a, 'stick-0', releaseAt(a, 'host'), [0, 6, 14]);
  await sleep(6000);
  const back = a.positions.get('stick-0');
  check(
    'backwards throw: counted (stick left the table)',
    y(a, 'stick-0') < ON_TABLE_Y,
    `lands ${fmt(back)}`,
  );
  check(
    'backwards throw: stays on the ground, inside the wall',
    !!back &&
      back[1] > -0.5 &&
      Math.abs(back[2]) < WALL_INNER_M &&
      Math.abs(back[0]) < WALL_INNER_M,
    `lands ${fmt(back)}, wall inner face ±${WALL_INNER_M.toFixed(1)} m`,
  );

  // 7. Sideways as hard as the protocol allows.
  send(a, 'stick-1', releaseAt(a, 'host'), [28, 8, 0]);
  await sleep(7000);
  const side = a.positions.get('stick-1');
  check(
    'sideways 29 m/s: stays on the ground, inside the wall',
    !!side && side[1] > -0.5 && Math.abs(side[0]) < WALL_INNER_M,
    `lands ${fmt(side)}`,
  );

  // 8. Straight up from right above the stick table: lands on the rack.
  const rackTop = a.positions.get('stick-3');
  const upFrom: Vec3 = rackTop
    ? [rackTop[0], 1.4, rackTop[2]]
    : releaseAt(a, 'host');
  send(a, 'stick-2', upFrom, [0, 4, 0]);
  await sleep(4000);
  const knocked = ['stick-3', 'stick-4', 'stick-5'].filter(
    (id) => y(a, id) <= ON_TABLE_Y,
  );
  check(
    'stick thrown straight up onto the table: the other sticks stay on it',
    knocked.length === 0,
    knocked.length
      ? `knocked off: ${knocked.map((id) => `${id} ${fmt(a.positions.get(id))}`).join(', ')}`
      : `stick-2 ${fmt(a.positions.get('stick-2'))}`,
  );

  // 9. Picking a thrown stick up off the grass and throwing it again.
  const again = a.positions.get('stick-0');
  if (again) send(a, 'stick-0', [again[0], 1, again[2]], [0, 3, -8]);
  await sleep(2000);
  const after = a.positions.get('stick-0');
  check(
    're-throwing a stick that already landed: refused',
    !!again &&
      !!after &&
      Math.hypot(after[0] - again[0], after[2] - again[2]) < 0.3,
    `${fmt(again)} → ${fmt(after)}`,
  );

  // 10. The last sticks (wherever they lie) end the turn: all six back on the guest table.
  for (const id of ['stick-3', 'stick-4', 'stick-5']) {
    if (y(a, id) > ON_TABLE_Y) {
      send(a, id, releaseAt(a, 'host'), missVelocity('host'));
      await sleep(900);
    }
  }
  const turned = await waitFor(() => a.match?.currentTurn === 'guest', 20000);
  await sleep(2500);
  check(
    'turn passes after six sticks (incl. the wild ones)',
    turned,
    `turn ${String(a.match?.currentTurn)}/${String(a.match?.phase)}`,
  );
  check(
    'all six sticks re-racked on the guest table, even the wall/grass ones',
    onTable(a, STICKS).length === 6,
    STICKS.map((id) => `${id}:${fmt(a.positions.get(id))}`).join(' '),
  );

  // 11. The guest leaves mid-turn and comes back within the grace.
  const turnBefore = a.match?.currentTurn;
  b.close();
  await sleep(3000);
  b = await ProtocolBot.connect(BASE, 'edge-b-0001', 4);
  const back2 = await waitFor(
    () => b.side === 'guest' && b.match !== null,
    10000,
  );
  check(
    'guest rejoins mid-turn: same seat, match kept',
    back2 &&
      b.match?.currentTurn === turnBefore &&
      (b.match?.winner ?? null) === null,
    `side ${String(b.side)}, turn ${String(b.match?.currentTurn)}`,
  );

  // 12. The rejoined guest spams all six sticks in one burst.
  await sleep(1500);
  for (const id of STICKS)
    send(b, id, releaseAt(b, 'guest'), missVelocity('guest'));
  const backToHost = await waitFor(
    () => a.match?.currentTurn === 'host',
    25000,
  );
  await sleep(2500);
  check(
    'six sticks in one burst: turn back to the host',
    backToHost,
    `turn ${String(a.match?.currentTurn)}/${String(a.match?.phase)}`,
  );
  check(
    '… and all six on the host table again',
    onTable(a, STICKS).length === 6,
    STICKS.map((id) => y(a, id).toFixed(2)).join(' '),
  );

  // 13. Ny runda while a stick is in the air.
  send(a, 'stick-0', releaseAt(a, 'host'), [0, 8, -6]);
  await sleep(300);
  await freshMatch(a);
  check(
    'Ny runda mid-flight: fresh match, every stick on a table',
    onTable(a, STICKS).length === 6 && a.match?.currentTurn === 'host',
    STICKS.map((id) => y(a, id).toFixed(2)).join(' '),
  );
  await playOpening(a, b);

  // 14. Inkast edge cases: the host fells a guest baseline kubb, then the guest
  // tries the wrong things before tossing it properly.
  const target = a.match?.baselineKubbs.guest[0];
  const targetAt = target ? a.positions.get(target) : undefined;
  for (const id of STICKS) {
    if ((a.match?.felledThisTurn.length ?? 0) > 0 || !targetAt) break;
    const from = releaseAt(a, 'host', targetAt[0]);
    const dz = targetAt[2] - from[2];
    const t = Math.abs(dz) / 7;
    // Ballistic: reach the kubb's lower half after t seconds.
    send(
      a,
      id,
      from,
      [(targetAt[0] - from[0]) / t, (0.15 - 1 + 4.905 * t * t) / t, dz / t],
      [-22, 0, 0],
    );
    await sleep(1500);
  }
  const felled = [...(a.match?.felledThisTurn ?? [])];
  for (const id of STICKS) {
    if (a.match?.currentTurn !== 'host') break;
    send(a, id, releaseAt(a, 'host'), missVelocity('host'));
    await sleep(500);
  }
  const inkast = await waitFor(
    () => a.match?.currentTurn === 'guest' && a.match.phase === 'inkast',
    20000,
  );
  check(
    'host felled a kubb → guest inkast',
    inkast && felled.length > 0,
    `felled ${felled.join(',')}`,
  );
  if (inkast) {
    await sleep(2500);
    const queued = a.match?.inkastQueue.map((q) => q.kubbId) ?? [];
    check(
      'queued kubbs wait on the guest kubb table',
      queued.every((id) => y(a, id) > 0.7),
      queued.map((id) => `${id}:${fmt(a.positions.get(id))}`).join(' '),
    );
    // a stick during the inkast
    send(b, 'stick-0', releaseAt(b, 'guest'), missVelocity('guest'));
    await sleep(1500);
    check(
      'guest throws a stick during its inkast: refused',
      y(a, 'stick-0') > ON_TABLE_Y || a.match?.phase === 'inkast',
      `stick-0 ${fmt(a.positions.get('stick-0'))}, phase ${String(a.match?.phase)}`,
    );
    // the host tosses the guest's kubb
    const q0 = queued[0];
    if (q0) {
      const before = a.positions.get(q0);
      send(a, q0, releaseAt(a, 'host'), [0, 3, -5]);
      await sleep(1500);
      const after2 = a.positions.get(q0);
      check(
        "host tosses the guest's queued kubb: refused",
        !!before &&
          !!after2 &&
          Math.hypot(after2[0] - before[0], after2[2] - before[2]) < 0.05,
        `${q0} ${fmt(before)} → ${fmt(after2)}`,
      );
      // proper toss, then the same kubb again at once
      const from: Vec3 = [0, 1, b.halves.farBaselineZ - 0.3];
      send(b, q0, from, [1.3, 3, 4.5]);
      await sleep(200);
      send(b, q0, from, [1.3, 3, 4.5]);
      await sleep(5000);
      check(
        'the same kubb tossed twice in a row: one toss, match goes on',
        (a.match?.winner ?? null) === null &&
          ((a.match?.fieldKubbs.length ?? 0) > 0 ||
            a.match?.phase === 'inkast'),
        `phase ${String(a.match?.phase)}, field ${String(a.match?.fieldKubbs.length)}, winner ${JSON.stringify(a.match?.winner)}`,
      );
    }
  }

  a.close();
  b.close();
  const failed = results.filter((r) => !r.ok);
  console.log(
    `\n${String(results.length - failed.length)}/${String(results.length)} passed`,
  );
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
