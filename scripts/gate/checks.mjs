// Pure verdict logic for `npm run gate:report` — see
// docs/superpowers/specs/2026-09-26-gate-report-design.md. Input: the
// debug relay's NDJSON entries; output: one result per checklist item.

export const THRESHOLDS = {
  pairWindowMs: 1500,
  incidentMinPairs: 3,
  positionToleranceM: 0.15,
  sinBinToleranceM: 0.1,
  restartMinS: 9,
  restartMaxS: 12,
  lookUpPitchRad: 1.0,
  maxTorsoYawRateRadS: 3.0,
  followUpMs: 3000,
  armEndSlackM: 0.005,
};

export function parseLog(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // a half-written last line while the relay appends — skip it
    }
  }
  return out;
}

const gate = (entries, message) =>
  entries.filter((e) => e.channel === 'gate' && e.message === message);
const at = (e) => e.receivedAt ?? e.timeMs;
const fmt = (e) =>
  `${new Date(at(e)).toISOString().slice(11, 19)} ${e.role}/${e.client} ${e.message} ${JSON.stringify(e.data)}`;
const verdict = (id, label, status, evidence = '') => ({
  id,
  label,
  status,
  evidence,
});

/** PASS when `relevant` is non-empty and none is bad; FAIL on the first
 * bad one; NOT SEEN when nothing relevant happened. */
function allOf(id, label, relevant, isBad) {
  if (relevant.length === 0) return verdict(id, label, 'NOT SEEN');
  const bad = relevant.find(isBad);
  return bad
    ? verdict(id, label, 'FAIL', fmt(bad))
    : verdict(id, label, 'PASS', fmt(relevant[0]));
}

function anyOf(id, label, relevant, isGood) {
  const good = relevant.find(isGood);
  if (good) return verdict(id, label, 'PASS', fmt(good));
  return relevant.length === 0
    ? verdict(id, label, 'NOT SEEN')
    : verdict(id, label, 'FAIL', fmt(relevant[0]));
}

function within(entries, from, predicate) {
  return entries.some(
    (e) =>
      at(e) >= at(from) &&
      at(e) - at(from) <= THRESHOLDS.followUpMs &&
      predicate(e),
  );
}

const freshState = (e) =>
  e.channel === 'gate' && e.message === 'match state' && e.data.fresh;

function sinBinCheck(entries) {
  const id = 'mp3a-sinbin';
  const label = 'felled kubbs stay in the sin-bin across rounds';
  // Keyed by ROLE, not client id: a headset that reloads mid-match gets a
  // new client id but keeps its side, and must still be compared.
  const prevByRole = new Map();
  let compared = 0;
  for (const e of entries) {
    if (freshState(e)) {
      prevByRole.delete(e.role);
      continue;
    }
    if (e.channel !== 'gate' || e.message !== 'sin-bin after round') continue;
    if (e.role === 'solo') continue;
    const prev = prevByRole.get(e.role);
    prevByRole.set(e.role, e.data.kubbs);
    if (!prev || Object.keys(prev).length === 0) continue;
    compared += 1;
    for (const [kubb, p] of Object.entries(prev)) {
      const q = e.data.kubbs[kubb];
      const moved =
        !q ||
        Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) >
          THRESHOLDS.sinBinToleranceM;
      if (moved)
        return verdict(
          id,
          label,
          'FAIL',
          `${kubb} ${q ? 'moved' : 'left the sin-bin'}: ${fmt(e)}`,
        );
    }
  }
  return compared === 0
    ? verdict(id, label, 'NOT SEEN')
    : verdict(id, label, 'PASS', `${compared} round transitions`);
}

function resetCheck(entries, side) {
  const id = `mp3a-reset-${side}`;
  const label = `"Ny runda" from the ${side} resets the match on both`;
  const presses = gate(entries, 'reset pressed').filter((e) => e.role === side);
  return allOf(
    id,
    label,
    presses,
    (p) =>
      !(
        within(entries, p, (e) => freshState(e) && e.role === 'host') &&
        within(entries, p, (e) => freshState(e) && e.role === 'guest')
      ),
  );
}

function colorCheck(entries) {
  const sent = gate(entries, 'avatar color').filter(
    (e) => e.data.event === 'sent' && e.role !== 'solo',
  );
  const color = (e, ev, who) =>
    e.channel === 'gate' &&
    e.message === 'avatar color' &&
    e.data.event === ev &&
    (who === undefined || e.data.who === who);
  return allOf(
    'mp3b-color',
    'color change reaches the other side and both HUDs',
    sent,
    (s) => {
      const same = (e) => e.data.colorIndex === s.data.colorIndex;
      const here = (e) => e.client === s.client;
      return !(
        within(
          entries,
          s,
          (e) => color(e, 'tinted', 'mine') && here(e) && same(e),
        ) &&
        within(
          entries,
          s,
          (e) => color(e, 'received') && !here(e) && same(e),
        ) &&
        within(
          entries,
          s,
          (e) => color(e, 'tinted', 'opponent') && !here(e) && same(e),
        )
      );
    },
  );
}

const SYNC_FIELDS = ['turn', 'winner', 'score', 'felled', 'gameMode'];

function piecesDiffer(a, b) {
  for (const [id, p] of Object.entries(a)) {
    const q = b[id];
    if (!q) continue;
    if (
      Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) >
      THRESHOLDS.positionToleranceM
    )
      return true;
  }
  return false;
}

/** Pairs every guest snapshot with the nearest host snapshot (by the
 * relay's receive time) and turns runs of ≥ incidentMinPairs
 * disagreeing pairs into incidents — shorter runs are network lag. */
export function syncPairs(entries) {
  const host = gate(entries, 'sync snapshot').filter((e) => e.role === 'host');
  const guest = gate(entries, 'sync snapshot').filter(
    (e) => e.role === 'guest',
  );
  const pairs = [];
  for (const gs of guest) {
    let best = null;
    for (const hs of host) {
      const d = Math.abs(at(hs) - at(gs));
      if (
        d <= THRESHOLDS.pairWindowMs &&
        (!best || d < Math.abs(at(best) - at(gs)))
      )
        best = hs;
    }
    if (best) pairs.push([best, gs]);
  }
  const incidents = [];
  for (const field of [...SYNC_FIELDS, 'pieces']) {
    let run = [];
    const close = () => {
      if (run.length >= THRESHOLDS.incidentMinPairs) {
        const [h, g] = run[0];
        incidents.push({
          field,
          fromMs: at(g),
          toMs: at(run[run.length - 1][1]),
          host:
            field === 'pieces' ? '(positions)' : JSON.stringify(h.data[field]),
          guest:
            field === 'pieces' ? '(positions)' : JSON.stringify(g.data[field]),
        });
      }
      run = [];
    };
    for (const pair of pairs) {
      const [h, g] = pair;
      const differs =
        field === 'pieces'
          ? piecesDiffer(h.data.pieces, g.data.pieces)
          : JSON.stringify(h.data[field]) !== JSON.stringify(g.data[field]);
      if (differs) run.push(pair);
      else close();
    }
    close();
  }
  return { pairs: pairs.length, incidents };
}

function sameRoomCheck(entries) {
  const id = 'same-room';
  const label = 'every headset joined the same room';
  const rooms = new Map();
  for (const e of entries) {
    if (e.channel === 'net' && e.message === 'joined multiplayer room') {
      rooms.set(e.client, e.data.roomId);
    }
  }
  if (rooms.size < 2) return verdict(id, label, 'NOT SEEN');
  const distinct = new Set(rooms.values());
  return distinct.size === 1
    ? verdict(id, label, 'PASS', [...distinct][0])
    : verdict(
        id,
        label,
        'FAIL',
        [...rooms].map(([client, room]) => `${client}: ${room}`).join(', '),
      );
}

export function runChecks(entries) {
  const summaries = gate(entries, 'round summary');
  const kings = gate(entries, 'king decision').filter((e) => e.role === 'host');
  const fits = gate(entries, 'avatar fit');
  const sync = syncPairs(entries);
  const scoreIncidents = sync.incidents.filter((i) => i.field === 'score');
  const created = entries.filter((e) => e.message === 'peer avatar created');
  const modeAdopted = gate(entries, 'mode adopted');

  const results = [
    modeAdopted.length > 0
      ? verdict(
          'gh15-adopt',
          "guest plays on the host's court",
          'PASS',
          fmt(modeAdopted[0]),
        )
      : sync.pairs === 0
        ? verdict('gh15-adopt', "guest plays on the host's court", 'NOT SEEN')
        : sync.incidents.some((i) => i.field === 'gameMode')
          ? verdict(
              'gh15-adopt',
              "guest plays on the host's court",
              'FAIL',
              'gameMode differs in sync snapshots',
            )
          : verdict(
              'gh15-adopt',
              "guest plays on the host's court",
              'NOT SEEN',
              'both started in the same mode — start them in different modes to exercise the adoption',
            ),
    anyOf(
      'gh15-release',
      "guest's own mode returns when the room empties",
      gate(entries, 'mode released'),
      (e) => {
        const adopted = modeAdopted.filter((a) => at(a) <= at(e)).at(-1);
        return !adopted || e.data.restoredMode === adopted.data.ownMode;
      },
    ),
    allOf(
      'gh15-lock',
      'mode button locked while connected',
      gate(entries, 'mode button pressed').filter((e) => e.role !== 'solo'),
      (e) => !e.data.locked,
    ),
    allOf(
      'gh16-host',
      "opponent's turn stays out of the host's stats",
      summaries.filter((e) => e.role === 'host' && e.data.byOpponent),
      (e) => e.data.statsRecorded,
    ),
    allOf(
      'gh16-guest',
      "guest's own turn lands in the guest's stats",
      summaries.filter(
        (e) =>
          e.role === 'guest' && !e.data.byOpponent && e.data.sticksThrown > 0,
      ),
      (e) => !e.data.statsRecorded,
    ),
    sinBinCheck(entries),
    sync.pairs === 0
      ? verdict('mp3a-score', 'score agrees on both', 'NOT SEEN')
      : scoreIncidents.length > 0
        ? verdict(
            'mp3a-score',
            'score agrees on both',
            'FAIL',
            JSON.stringify(scoreIncidents[0]),
          )
        : verdict(
            'mp3a-score',
            'score agrees on both',
            'PASS',
            `${sync.pairs} snapshot pairs`,
          ),
    anyOf(
      'mp3a-king-early',
      'king felled early = loss',
      kings.filter((e) => e.data.endReason === 'kingFelledEarly'),
      (e) => e.data.winner !== e.data.thrower,
    ),
    anyOf(
      'mp3a-king-win',
      'king after all kubbs = win',
      kings.filter((e) => e.data.endReason === 'allKubbsAndKing'),
      (e) => e.data.winner === e.data.thrower,
    ),
    kings.some((e) => e.data.stickNumberInRound === 6)
      ? verdict(
          'mp3a-king-6th',
          'king decided by the 6th stick',
          'PASS',
          fmt(kings.find((e) => e.data.stickNumberInRound === 6)),
        )
      : verdict('mp3a-king-6th', 'king decided by the 6th stick', 'NOT SEEN'),
    allOf(
      'mp3a-restart',
      'auto-restart after ~10 s, host starts',
      gate(entries, 'match restart').filter((e) => e.role === 'host'),
      (r) =>
        r.data.secondsSinceFinished < THRESHOLDS.restartMinS ||
        r.data.secondsSinceFinished > THRESHOLDS.restartMaxS ||
        !within(
          entries,
          r,
          (e) => freshState(e) && e.role === 'host' && e.data.turn === 'host',
        ),
    ),
    resetCheck(entries, 'host'),
    resetCheck(entries, 'guest'),
    new Set(created.map((e) => e.role)).size >= 2 &&
    created.some((e) => e.role === 'host') &&
    created.some((e) => e.role === 'guest')
      ? verdict(
          'mp3b-avatar',
          'both see a body',
          'PASS',
          `${created.length} avatars created`,
        )
      : verdict(
          'mp3b-avatar',
          'both see a body',
          'NOT SEEN',
          created.length ? `only on ${created[0].role}` : '',
        ),
    allOf(
      'mp3b-arms',
      'arm ends at the mitten',
      fits,
      (e) =>
        Math.max(e.data.leftArmEndToHandM, e.data.rightArmEndToHandM) >
        e.data.handSizeM / 2 + THRESHOLDS.armEndSlackM,
    ),
    allOf(
      'mp3b-torso',
      'no torso twitch on a full look-up',
      fits.filter((e) => e.data.maxHeadPitchRad >= THRESHOLDS.lookUpPitchRad),
      (e) => e.data.maxTorsoYawRateRadS > THRESHOLDS.maxTorsoYawRateRadS,
    ),
    colorCheck(entries),
    sync.pairs === 0
      ? verdict('sync', 'host and guest agree', 'NOT SEEN')
      : sync.incidents.length > 0
        ? verdict(
            'sync',
            'host and guest agree',
            'FAIL',
            sync.incidents
              .map(
                (i) =>
                  `${i.field} ${new Date(i.fromMs).toISOString().slice(11, 19)}–${new Date(i.toMs).toISOString().slice(11, 19)} host=${i.host} guest=${i.guest}`,
              )
              .join('; '),
          )
        : verdict(
            'sync',
            'host and guest agree',
            'PASS',
            `${sync.pairs} pairs, 0 incidents`,
          ),
    sameRoomCheck(entries),
    verdict('eyes-proportions', 'avatar proportions look right', 'EYES'),
    verdict('eyes-visor', 'the visor sits on the head', 'EYES'),
    verdict('eyes-score-row', 'the two-colored score row lays out', 'EYES'),
  ];
  return results;
}
