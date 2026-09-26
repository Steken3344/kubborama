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
  it('mp3a-sinbin: FAILs when a sin-bin kubb moves or vanishes within a match', () => {
    const a = g('host', 'sin-bin after round', {
      kubbs: { 'kubb-1': [2, 0.15, 1] },
    });
    const same = g('host', 'sin-bin after round', {
      kubbs: { 'kubb-1': [2, 0.15, 1], 'kubb-2': [2.3, 0.15, 1] },
    });
    const gone = g('host', 'sin-bin after round', { kubbs: {} });
    expect(status([a, same], 'mp3a-sinbin')).toBe('PASS');
    expect(status([a, gone], 'mp3a-sinbin')).toBe('FAIL');
    const fresh = g('host', 'match state', { fresh: true });
    expect(status([a, fresh, gone], 'mp3a-sinbin')).toBe('NOT SEEN');
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
