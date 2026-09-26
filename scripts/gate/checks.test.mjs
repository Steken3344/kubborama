import { describe, expect, it } from 'vitest';
import { runChecks, syncPairs } from './checks.mjs';

let t = 0;
const g = (role, message, data, dtMs = 100, client = role) => {
  t += dtMs;
  return {
    level: 'info',
    channel: 'gate',
    message,
    data,
    role,
    client,
    timeMs: t,
    receivedAt: t,
  };
};
const status = (entries, id) =>
  runChecks(entries).find((r) => r.id === id).status;
const snap = (role, over = {}) =>
  g(
    role,
    'sync snapshot',
    {
      turn: 'host',
      winner: null,
      score: { host: 0, guest: 0 },
      felled: { host: [], guest: [] },
      gameMode: 'simple',
      pieces: { king: [0, 0.15, -3] },
      ...over,
    },
    500,
  );

describe('runChecks', () => {
  it('everything is NOT SEEN (or EYES) on an empty log', () => {
    for (const r of runChecks([])) {
      expect(['NOT SEEN', 'EYES']).toContain(r.status);
    }
  });
  it('gh16-host: PASS when the opponent round is not recorded, FAIL when it is', () => {
    const ok = g('host', 'round summary', {
      byOpponent: true,
      statsRecorded: false,
    });
    const bad = g('host', 'round summary', {
      byOpponent: true,
      statsRecorded: true,
    });
    expect(status([ok], 'gh16-host')).toBe('PASS');
    expect(status([ok, bad], 'gh16-host')).toBe('FAIL');
  });
  it('gh15-lock: an unlocked press while connected FAILs, solo presses do not count', () => {
    expect(
      status(
        [g('solo', 'mode button pressed', { locked: false })],
        'gh15-lock',
      ),
    ).toBe('NOT SEEN');
    expect(
      status(
        [g('guest', 'mode button pressed', { locked: true })],
        'gh15-lock',
      ),
    ).toBe('PASS');
    expect(
      status(
        [g('guest', 'mode button pressed', { locked: false })],
        'gh15-lock',
      ),
    ).toBe('FAIL');
  });
  it('king rules: early loss, win after all, 6th stick', () => {
    const early = g('host', 'king decision', {
      thrower: 'host',
      winner: 'guest',
      endReason: 'kingFelledEarly',
      stickNumberInRound: 6,
    });
    const win = g('host', 'king decision', {
      thrower: 'guest',
      winner: 'guest',
      endReason: 'allKubbsAndKing',
      stickNumberInRound: 3,
    });
    expect(status([early, win], 'mp3a-king-early')).toBe('PASS');
    expect(status([early, win], 'mp3a-king-win')).toBe('PASS');
    expect(status([early, win], 'mp3a-king-6th')).toBe('PASS');
    expect(status([win], 'mp3a-king-6th')).toBe('NOT SEEN');
  });
  it('mp3a-restart: PASS in [9, 12] s followed by a fresh host turn', () => {
    const r = g('host', 'match restart', { secondsSinceFinished: 10.02 });
    const fresh = g('host', 'match state', { fresh: true, turn: 'host' });
    expect(status([r, fresh], 'mp3a-restart')).toBe('PASS');
    expect(
      status(
        [g('host', 'match restart', { secondsSinceFinished: 14 }), fresh],
        'mp3a-restart',
      ),
    ).toBe('FAIL');
  });
  it('mp3a-reset-guest: needs a fresh state on both sides within 3 s', () => {
    const press = g('guest', 'reset pressed', {});
    const h = g('host', 'match state', { fresh: true });
    const gu = g('guest', 'match state', { fresh: true });
    expect(status([press, h, gu], 'mp3a-reset-guest')).toBe('PASS');
    expect(status([press, h], 'mp3a-reset-guest')).toBe('FAIL');
  });
  it('mp3b-arms and mp3b-torso', () => {
    const fit = (over) =>
      g('guest', 'avatar fit', {
        leftArmEndToHandM: 0.05,
        rightArmEndToHandM: 0.05,
        handSizeM: 0.1,
        maxTorsoYawRateRadS: 1,
        maxHeadPitchRad: 1.2,
        ...over,
      });
    expect(status([fit({})], 'mp3b-arms')).toBe('PASS');
    expect(status([fit({ leftArmEndToHandM: 0.2 })], 'mp3b-arms')).toBe('FAIL');
    expect(status([fit({})], 'mp3b-torso')).toBe('PASS');
    expect(status([fit({ maxTorsoYawRateRadS: 5 })], 'mp3b-torso')).toBe(
      'FAIL',
    );
    expect(
      status(
        [fit({ maxHeadPitchRad: 0.2, maxTorsoYawRateRadS: 5 })],
        'mp3b-torso',
      ),
    ).toBe('NOT SEEN');
  });
  it('mp3b-color: sent → received + opponent tint elsewhere, own tint here, within 3 s', () => {
    const sent = g('host', 'avatar color', { event: 'sent', colorIndex: 2 });
    const mine = g('host', 'avatar color', {
      event: 'tinted',
      who: 'mine',
      colorIndex: 2,
    });
    const rec = g('guest', 'avatar color', {
      event: 'received',
      colorIndex: 2,
    });
    const theirs = g('guest', 'avatar color', {
      event: 'tinted',
      who: 'opponent',
      colorIndex: 2,
    });
    expect(status([sent, mine, rec, theirs], 'mp3b-color')).toBe('PASS');
    expect(status([sent, mine, rec], 'mp3b-color')).toBe('FAIL');
  });
});

describe('syncPairs', () => {
  it('pairs host/guest snapshots and ignores a 2-pair lag', () => {
    const e = [];
    for (let i = 0; i < 6; i++) {
      const lag = i === 2 || i === 3;
      e.push(snap('host', { score: { host: i, guest: 0 } }));
      e.push(snap('guest', { score: { host: lag ? i - 1 : i, guest: 0 } }));
    }
    const { pairs, incidents } = syncPairs(e);
    expect(pairs).toBe(6);
    expect(incidents).toEqual([]);
  });
  it('reports a sustained disagreement once, and position drift over 0.15 m', () => {
    const e = [];
    for (let i = 0; i < 5; i++) {
      e.push(snap('host', { pieces: { king: [0, 0.15, -3] } }));
      e.push(snap('guest', { pieces: { king: [0.3, 0.15, -3] } }));
    }
    const { incidents } = syncPairs(e);
    expect(incidents).toHaveLength(1);
    expect(incidents[0].field).toBe('pieces');
  });
});

describe('review fixes', () => {
  it('gh15-adopt is NOT SEEN (not PASS) when both already had the same mode', () => {
    const e = [snap('host'), snap('guest'), snap('host'), snap('guest')];
    expect(status(e, 'gh15-adopt')).toBe('NOT SEEN');
  });
  it("gh15-release FAILs when the restored mode is not the guest's own", () => {
    const adopted = g('guest', 'mode adopted', {
      hostMode: 'simple',
      ownMode: 'advanced',
    });
    const good = g('solo', 'mode released', { restoredMode: 'advanced' });
    const bad = g('solo', 'mode released', { restoredMode: 'simple' });
    expect(status([adopted, good], 'gh15-release')).toBe('PASS');
    expect(status([adopted, bad], 'gh15-release')).toBe('FAIL');
  });
  it('same-room FAILs when clients joined different rooms', () => {
    const j = (client, roomId) => ({
      level: 'info',
      channel: 'net',
      message: 'joined multiplayer room',
      data: { roomId },
      role: 'solo',
      client,
      timeMs: 1,
      receivedAt: 1,
    });
    expect(status([j('a', 'x'), j('b', 'x')], 'same-room')).toBe('PASS');
    expect(status([j('a', 'x'), j('b', 'y')], 'same-room')).toBe('FAIL');
    expect(status([j('a', 'x')], 'same-room')).toBe('NOT SEEN');
  });
});

describe('MP4 field kubbs', () => {
  const landed = (legal, attempt, kubbId = 'kubb-0') =>
    g('host', 'inkast landed', { kubbId, legal, attempt });
  const raised = (reason, kubbId = 'kubb-0') =>
    g('host', 'kubb raised', { kubbId, reason });
  it('mp4-inkast-legal: a legal landing is raised as a field kubb', () => {
    expect(
      status([landed(true, 1), raised('inkast')], 'mp4-inkast-legal'),
    ).toBe('PASS');
    expect(status([landed(true, 1)], 'mp4-inkast-legal')).toBe('FAIL');
    expect(status([], 'mp4-inkast-legal')).toBe('NOT SEEN');
  });
  it('mp4-inkast-retry: a first miss goes back to the rack', () => {
    const miss = landed(false, 1);
    const back = g('host', 'kubb returned to rack', { kubbId: 'kubb-0' });
    expect(status([miss, back], 'mp4-inkast-retry')).toBe('PASS');
    expect(status([landed(false, 1)], 'mp4-inkast-retry')).toBe('FAIL');
  });
  it('mp4-inkast-clamp: a second miss is clamped in and raised', () => {
    expect(
      status([landed(false, 2), raised('inkastClamped')], 'mp4-inkast-clamp'),
    ).toBe('PASS');
    expect(
      status([landed(false, 2), raised('inkast')], 'mp4-inkast-clamp'),
    ).toBe('FAIL');
  });
  it('mp4-field-first, mp4-rebound, mp4-advantage', () => {
    expect(status([raised('earlyBaseline', 'kubb-7')], 'mp4-field-first')).toBe(
      'PASS',
    );
    expect(status([], 'mp4-field-first')).toBe('NOT SEEN');
    expect(status([raised('rebound', 'kubb-6')], 'mp4-rebound')).toBe('PASS');
    const line = (z) => g('host', 'advantage line', { side: 'host', z });
    expect(status([line(null)], 'mp4-advantage')).toBe('NOT SEEN');
    expect(status([line(-3)], 'mp4-advantage')).toBe('PASS');
  });
  it('sync compares the phase', () => {
    const e = [];
    for (let i = 0; i < 4; i++) {
      e.push(snap('host', { phase: 'inkast' }));
      e.push(snap('guest', { phase: 'throwing' }));
    }
    expect(syncPairs(e).incidents.map((i) => i.field)).toContain('phase');
  });
});
