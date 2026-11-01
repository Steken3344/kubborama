import { describe, expect, it } from 'vitest';
import { fromAxisAngle } from '../src/core/quat.js';
import type { MatchState } from '../src/core/match.js';
import { MatchHost } from './matchHost.js';
import type { MatchWorld, RoundReport } from './matchHost.js';
import type { Pose } from './physicsWorld.js';

const DT = 1 / 60;
const UP: Pose['quaternion'] = [0, 0, 0, 1];
const LYING: Pose['quaternion'] = fromAxisAngle([1, 0, 0], Math.PI / 2);

/** A scripted world: bodies sit where tests put them; a thrown body is
 * "moving" until a test lands it. */
function fakeWorld(): MatchWorld & {
  land(
    id: string,
    position: Pose['position'],
    quaternion?: Pose['quaternion'],
  ): void;
  poses: Map<string, Pose>;
} {
  const homes = new Map<string, Pose>();
  for (let i = 0; i < 6; i++)
    homes.set(`stick-${i}`, {
      position: [i * 0.08, 0.97, 1.09],
      quaternion: UP,
    });
  for (let i = 0; i < 10; i++) {
    const guest = i < 5;
    homes.set(`kubb-${i}`, {
      position: [(i % 5) * 0.6 - 1.2, 0.075, guest ? -6 : -0.05],
      quaternion: UP,
    });
  }
  homes.set('king', { position: [0, 0.15, -3], quaternion: UP });
  const poses = new Map([...homes].map(([id, p]) => [id, { ...p }]));
  const moving = new Set<string>();
  return {
    poses,
    homePose: (id) => homes.get(id) ?? null,
    pose: (id) => poses.get(id) ?? null,
    setPose: (id, pose) => {
      poses.set(id, pose);
      moving.delete(id);
    },
    speeds: (id) => (moving.has(id) ? [3, 3] : [0, 0]),
    setAngularDamping: () => undefined,
    setLinearDamping: () => undefined,
    applyImpulse: () => undefined,
    applyThrow: (input) => {
      poses.set(input.pieceId, {
        position: input.position,
        quaternion: input.quaternion,
      });
      moving.add(input.pieceId);
      return true;
    },
    land(id, position, quaternion = LYING) {
      poses.set(id, { position, quaternion });
      moving.delete(id);
    },
  };
}

function host(mode: 'simple' | 'advanced' = 'simple') {
  const world = fakeWorld();
  const states: Array<MatchState | null> = [];
  const rounds: RoundReport[] = [];
  const gates: Array<{ message: string; data: Record<string, unknown> }> = [];
  const notices: Array<{ kind: string; side: string }> = [];
  const mh = new MatchHost(world, mode, {
    matchState: (s) => states.push(s),
    roundEnded: (r) => rounds.push(r),
    notice: (kind, side) => notices.push({ kind, side }),
    gate: (message, data) => gates.push({ message, data }),
  });
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += DT) mh.tick(DT);
  };
  const throwStick = (side: 'host' | 'guest', id: string) =>
    mh.onThrow(side, {
      pieceId: id,
      position: [0, 1, -0.3],
      quaternion: UP,
      linearVelocity: [0, 3, -6],
      angularVelocity: [-20, 0, 0],
    });
  return {
    world,
    mh,
    states,
    rounds,
    gates,
    notices,
    run,
    throwStick,
    last: () => states.at(-1) ?? null,
  };
}

/** The thrower's racked sticks (six; two on the match's opening turn):
 * throw each, land it on the grass. */
function throwTurn(h: ReturnType<typeof host>, side: 'host' | 'guest') {
  for (const [i, id] of h.mh.rackedSticks().entries()) {
    expect(h.throwStick(side, id)).toBe(true);
    h.world.land(id, [i * 0.3 - 0.8, 0.022, -3.5]);
    h.run(0.6);
  }
}

/** Both opening turns, nothing felled: the host's two sticks, then the
 * guest's six — the match proper (six a turn) starts at the host. */
function playOpening(h: ReturnType<typeof host>) {
  throwTurn(h, 'host');
  h.run(3);
  throwTurn(h, 'guest');
  h.run(3);
  expect(h.last()?.currentTurn).toBe('host');
  expect(h.mh.rackedSticks()).toHaveLength(6);
}

describe('MatchHost — practice (one player)', () => {
  it('a round of six sticks ends, is reported, and everything goes home', () => {
    const h = host();
    h.mh.setPlayers(['host']);
    h.run(1.2);
    throwTurn(h, 'host');
    h.run(1);
    expect(h.rounds).toHaveLength(1);
    expect(h.rounds[0]?.side).toBe('host');
    expect(h.rounds[0]?.sticksThrownThisRound).toBe(6);
    expect(h.world.poses.get('stick-0')?.position[2]).toBeCloseTo(1.09);
    expect(h.last()).toBeNull(); // no match in practice
  });
  it('a stick cannot be thrown twice in a round', () => {
    const h = host();
    h.mh.setPlayers(['host']);
    expect(h.throwStick('host', 'stick-0')).toBe(true);
    expect(h.throwStick('host', 'stick-0')).toBe(false);
  });
});

describe('MatchHost — match (two players)', () => {
  it('starts a match; the off-turn side cannot throw', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    expect(h.last()?.currentTurn).toBe('host');
    expect(h.throwStick('guest', 'stick-0')).toBe(false);
    expect(h.throwStick('host', 'stick-0')).toBe(true);
  });

  it('a felled kubb goes to the guest’s inkast rack; the toss lands as a field kubb', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    expect(h.throwStick('host', 'stick-0')).toBe(true);
    h.world.land('kubb-0', [-1.2, 0.035, -6.1]); // knocked flat
    h.world.land('stick-0', [0, 0.022, -5.8]);
    h.run(0.8);
    expect(h.last()?.felledThisTurn).toEqual(['kubb-0']);
    for (let i = 1; i < 6; i++) {
      h.throwStick('host', `stick-${i}`);
      h.world.land(`stick-${i}`, [i * 0.3, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
    const s = h.last();
    expect(s?.currentTurn).toBe('guest');
    expect(s?.phase).toBe('inkast');
    expect(s?.inkastQueue).toEqual([{ kubbId: 'kubb-0', attempt: 1 }]);
    // Rack behind the guest's (far) baseline, sticks at the far rack.
    expect(h.world.poses.get('kubb-0')?.position[2]).toBeLessThan(-6);
    expect(h.world.poses.get('stick-0')?.position[2]).toBeLessThan(-6);
    // Sticks are locked during the inkast.
    expect(h.throwStick('guest', 'stick-0')).toBe(false);
    // The guest tosses it onto the host half.
    expect(
      h.mh.onThrow('guest', {
        pieceId: 'kubb-0',
        position: [0, 1, -6.4],
        quaternion: UP,
        linearVelocity: [0, 3, 5],
        angularVelocity: [0, 0, 0],
      }),
    ).toBe(true);
    h.world.land('kubb-0', [0.5, 0.035, -2]);
    h.run(0.8);
    const after = h.last();
    expect(after?.phase).toBe('throwing');
    expect(after?.fieldKubbs).toEqual([
      { kubbId: 'kubb-0', half: 'host', x: 0.5, z: -2 },
    ]);
    expect(h.world.poses.get('kubb-0')?.quaternion).toEqual(UP); // raised
    expect(h.gates.map((g) => g.message)).toContain('inkast landed');
    expect(
      h.gates.find((g) => g.message === 'kubb raised')?.data['reason'],
    ).toBe('inkast');
    expect(h.throwStick('guest', 'stick-0')).toBe(true);
  });

  it('the king felled early is decided after the grace, then the match restarts', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    h.throwStick('host', 'stick-0');
    h.world.land('king', [0, 0.045, -3.1]);
    h.run(0.8);
    expect(h.last()?.winner).toBeNull(); // grace still running
    h.run(1.5);
    expect(h.last()?.winner).toBe('guest');
    expect(h.last()?.endReason).toBe('kingFelledEarly');
    expect(
      h.gates.find((g) => g.message === 'king decision')?.data[
        'stickNumberInRound'
      ],
    ).toBe(1);
    h.run(10.5);
    expect(h.last()?.winner).toBeNull();
    expect(h.gates.map((g) => g.message)).toContain('match restart');
  });

  it('a king felled by an inkast toss is an immediate-rule loss for the tosser', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    h.throwStick('host', 'stick-0');
    h.world.land('kubb-0', [-1.2, 0.035, -6.1]);
    h.world.land('stick-0', [0, 0.022, -5.8]);
    h.run(0.8);
    for (let i = 1; i < 6; i++) {
      h.throwStick('host', `stick-${i}`);
      h.world.land(`stick-${i}`, [i * 0.3, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
    expect(h.last()?.phase).toBe('inkast');
    h.mh.onThrow('guest', {
      pieceId: 'kubb-0',
      position: [0, 1, -6.4],
      quaternion: UP,
      linearVelocity: [0, 3, 5],
      angularVelocity: [0, 0, 0],
    });
    h.world.land('king', [0, 0.045, -3.1]); // the toss hits the king
    h.run(2.5);
    expect(h.last()?.winner).toBe('host');
    expect(h.last()?.endReason).toBe('kingFelledByInkast');
  });

  it('a player leaving ends the match (practice again)', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.mh.setPlayers(['guest']);
    expect(h.last()).toBeNull();
    expect(h.throwStick('guest', 'stick-0')).toBe(true); // the sole player practises
  });
});

describe('MatchHost — stability scenarios (2026-10-31)', () => {
  /** Host knocks the given guest kubbs flat, one stick each. */
  function knock(
    h: ReturnType<typeof host>,
    side: 'host' | 'guest',
    ids: string[],
    firstStick = 0,
  ) {
    ids.forEach((id, i) => {
      expect(h.throwStick(side, `stick-${firstStick + i}`)).toBe(true);
      const home = h.world.homePose(id)?.position ?? [0, 0, 0];
      h.world.land(id, [home[0], 0.035, home[2] - 0.1]);
      h.world.land(`stick-${firstStick + i}`, [home[0], 0.022, home[2] + 0.3]);
      h.run(0.7);
    });
  }

  it('a full match: all five kubbs then the king with the 6th stick = win', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    playOpening(h);
    knock(h, 'host', ['kubb-0', 'kubb-1', 'kubb-2', 'kubb-3', 'kubb-4']);
    expect(h.last()?.baselineKubbs.guest).toEqual([]);
    expect(h.throwStick('host', 'stick-5')).toBe(true);
    h.world.land('king', [0, 0.045, -3.1]);
    h.world.land('stick-5', [0, 0.022, -2.8]);
    h.run(2.5);
    expect(h.last()?.winner).toBe('host');
    expect(h.last()?.endReason).toBe('allKubbsAndKing');
    expect(
      h.gates.find((g) => g.message === 'king decision')?.data[
        'stickNumberInRound'
      ],
    ).toBe(6);
  });

  it('Ny runda during the inkast: a fresh match, an empty rack, sticks back at A', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    knock(h, 'host', ['kubb-0']);
    for (let i = 1; i < 6; i++) {
      h.throwStick('host', `stick-${i}`);
      h.world.land(`stick-${i}`, [i * 0.3, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
    expect(h.last()?.phase).toBe('inkast');
    h.mh.reset();
    const s = h.last();
    expect(s?.phase).toBe('throwing');
    expect(s?.currentTurn).toBe('host');
    expect(s?.inkastQueue).toEqual([]);
    expect(h.world.poses.get('kubb-0')?.position[2]).toBeCloseTo(-6);
    expect(h.world.poses.get('stick-0')?.position[2]).toBeCloseTo(1.09);
    expect(h.throwStick('host', 'stick-0')).toBe(true);
  });

  it('the second player joining mid-practice starts a fresh match, no round reported', () => {
    const h = host();
    h.mh.setPlayers(['host']);
    h.run(1.2);
    h.throwStick('host', 'stick-0');
    h.world.land('stick-0', [0, 0.022, -3]);
    h.run(0.7);
    h.mh.setPlayers(['host', 'guest']);
    expect(h.rounds).toHaveLength(0);
    expect(h.last()?.currentTurn).toBe('host');
    expect(h.world.poses.get('stick-0')?.position[2]).toBeCloseTo(1.09);
    expect(h.throwStick('host', 'stick-0')).toBe(true);
  });

  it('an early baseline kubb is restored home and can be felled again later', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    knock(h, 'host', ['kubb-0']); // host fells a guest kubb
    for (let i = 1; i < 6; i++) {
      h.throwStick('host', `stick-${i}`);
      h.world.land(`stick-${i}`, [i * 0.3, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
    // Guest tosses it onto the host half → a field kubb there.
    h.mh.onThrow('guest', {
      pieceId: 'kubb-0',
      position: [0, 1, -6.4],
      quaternion: UP,
      linearVelocity: [0, 3, 5],
      angularVelocity: [0, 0, 0],
    });
    h.world.land('kubb-0', [0.5, 0.035, -2]);
    h.run(0.8);
    expect(h.last()?.phase).toBe('throwing');
    // Guest knocks a host BASELINE kubb while the field kubb stands → restored.
    knock(h, 'guest', ['kubb-7']);
    expect(
      h.gates.some(
        (g) =>
          g.message === 'kubb raised' && g.data['reason'] === 'earlyBaseline',
      ),
    ).toBe(true);
    expect(h.world.poses.get('kubb-7')?.quaternion).toEqual(UP);
    h.run(0.6); // re-armed once seen upright and resting
    // Now the field kubb, then kubb-7 again — this time it counts.
    knock(h, 'guest', ['kubb-0'], 1);
    knock(h, 'guest', ['kubb-7'], 2);
    expect(h.last()?.felledThisTurn).toEqual(['kubb-0', 'kubb-7']);
  });

  it('a stick that never comes to rest is force-settled so the round still ends', () => {
    const h = host();
    h.mh.setPlayers(['host']);
    h.run(1.2);
    for (let i = 0; i < 6; i++) {
      h.throwStick('host', `stick-${i}`); // never landed: keeps "moving"
    }
    h.run(9);
    expect(h.rounds).toHaveLength(1);
  });

  it('a tossed kubb that never comes to rest still lands (timed out)', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    knock(h, 'host', ['kubb-0']);
    for (let i = 1; i < 6; i++) {
      h.throwStick('host', `stick-${i}`);
      h.world.land(`stick-${i}`, [i * 0.3, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
    h.mh.onThrow('guest', {
      pieceId: 'kubb-0',
      position: [0, 1, -6.4],
      quaternion: UP,
      linearVelocity: [0, 3, 5],
      angularVelocity: [0, 0, 0],
    });
    h.run(7); // > maxTossFlightS
    const landed = h.gates.find((g) => g.message === 'inkast landed');
    expect(landed?.data['timedOut']).toBe(true);
  });

  it('rejects a toss of a kubb that is not queued, and a toss by the wrong side', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    knock(h, 'host', ['kubb-0']);
    for (let i = 1; i < 6; i++) {
      h.throwStick('host', `stick-${i}`);
      h.world.land(`stick-${i}`, [i * 0.3, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
    const toss = (side: 'host' | 'guest', id: string) =>
      h.mh.onThrow(side, {
        pieceId: id,
        position: [0, 1, -6.4],
        quaternion: UP,
        linearVelocity: [0, 3, 5],
        angularVelocity: [0, 0, 0],
      });
    expect(toss('guest', 'kubb-3')).toBe(false); // not queued
    expect(toss('host', 'kubb-0')).toBe(false); // not the thrower
    expect(toss('guest', 'kubb-0')).toBe(true);
    expect(toss('guest', 'kubb-0')).toBe(false); // already in the air
  });
});

describe('MatchHost — foot faults', () => {
  const release = (z: number) => ({
    pieceId: 'stick-0',
    position: [0, 1, z] as [number, number, number],
    quaternion: UP,
    linearVelocity: [0, 3, -6] as [number, number, number],
    angularVelocity: [-20, 0, 0] as [number, number, number],
  });

  it('a release within the reach of the baseline is a normal throw', () => {
    const h = host();
    h.mh.setPlayers(['host']);
    expect(h.mh.onThrow('host', release(-0.5))).toBe(true);
    expect(h.notices).toEqual([]);
  });

  it('a release far over the line counts, does nothing, and is announced', () => {
    const h = host();
    h.mh.setPlayers(['host']);
    expect(h.mh.onThrow('host', release(-2))).toBe(true);
    expect(h.notices).toEqual([{ kind: 'footFault', side: 'host' }]);
    expect(h.gates.some((g) => g.message === 'foot fault')).toBe(true);
    // Laid beside the court (the sin bin), not flying at the kubbs.
    const pose = h.world.poses.get('stick-0');
    expect(pose?.position[0]).toBeGreaterThan(3);
    // Thrown and settled: it cannot be thrown again this round.
    expect(h.mh.onThrow('host', release(-0.3))).toBe(false);
  });

  it('side B is judged from its own (far) baseline', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    throwTurn(h, 'host');
    h.run(4);
    // The guest's line is the far baseline (-6 on the backyard court).
    const guestRelease = { ...release(-4), pieceId: 'stick-1' };
    expect(h.last()).toMatchObject({ currentTurn: 'guest', phase: 'throwing' });
    expect(h.mh.onThrow('guest', guestRelease)).toBe(true);
    expect(h.notices).toEqual([{ kind: 'footFault', side: 'guest' }]);
  });
});

describe('MatchHost — time limit (2026-11-01)', () => {
  it('runs the clock only in a match, marks time up, and plays on while level', () => {
    const h = host();
    h.mh.setTimeLimit(1);
    h.mh.setPlayers(['host']);
    expect(h.mh.clock()).toBeNull(); // practice: no clock
    h.mh.setPlayers(['host', 'guest']);
    h.run(30);
    expect(h.mh.clock()?.remainingS).toBeCloseTo(30, 0);
    h.run(31);
    expect(h.last()?.timeUp).toBe(true);
    expect(h.gates.some((g) => g.message === 'time up')).toBe(true);
    expect(h.mh.clock()).toEqual({ remainingS: 0, timeUp: true });
    // Nothing felled on either side: level after the pair → sudden death.
    throwTurn(h, 'host');
    h.run(2);
    throwTurn(h, 'guest');
    h.run(2);
    expect(h.last()?.winner).toBeNull();
    expect(h.last()?.currentTurn).toBe('host');
  });

  it('switching the limit off lifts the tiebreak; a new match restarts the clock', () => {
    const h = host();
    h.mh.setTimeLimit(1);
    h.mh.setPlayers(['host', 'guest']);
    h.run(61);
    h.mh.setTimeLimit(0);
    expect(h.last()?.timeUp).toBe(false);
    expect(h.mh.clock()).toBeNull();
    h.mh.setTimeLimit(20);
    h.mh.reset();
    expect(h.mh.clock()?.remainingS).toBe(1200);
  });
});

describe('MatchHost — time limit changes (review, 2026-11-01)', () => {
  it('a limit raised past the time played lifts time-up; the clock keeps counting with no limit', () => {
    const h = host();
    h.mh.setTimeLimit(1);
    h.mh.setPlayers(['host', 'guest']);
    h.run(61);
    expect(h.last()?.timeUp).toBe(true);
    h.mh.setTimeLimit(20);
    expect(h.last()?.timeUp).toBe(false);
    expect(h.mh.clock()?.remainingS).toBeCloseTo(1200 - 61, 0);
    h.mh.setTimeLimit(0);
    h.run(60);
    h.mh.setTimeLimit(20);
    expect(h.mh.clock()?.remainingS).toBeCloseTo(1200 - 121, 0);
  });

  it('reports the racked sticks', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    expect(h.mh.rackedSticks()).toHaveLength(2); // the opening turn
    h.throwStick('host', 'stick-0');
    expect(h.mh.rackedSticks()).not.toContain('stick-0');
  });

  it('the starter throws two sticks on the opening turn, then six a turn (Erik, 2026-11-01)', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    expect(h.mh.rackedSticks()).toEqual(['stick-0', 'stick-1']);
    // The other four wait on the guest's table and cannot be thrown now.
    expect(h.throwStick('host', 'stick-2')).toBe(false);
    expect(h.world.pose('stick-2')?.position[2]).toBeLessThan(-4);
    throwTurn(h, 'host');
    h.run(3);
    expect(h.last()?.currentTurn).toBe('guest');
    expect(h.mh.rackedSticks()).toHaveLength(6);
    throwTurn(h, 'guest');
    h.run(3);
    expect(h.last()?.currentTurn).toBe('host');
    expect(h.mh.rackedSticks()).toHaveLength(6);
  });
});

describe('MatchHost — put down, not thrown (2026-11-01)', () => {
  it('a slow release is refused: the stick stays racked and can be thrown after', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    const putDown = h.mh.onThrow('host', {
      pieceId: 'stick-0',
      position: [0, 1, 0.3],
      quaternion: UP,
      linearVelocity: [0, -0.3, 0.2],
      angularVelocity: [0, 0, 0],
    });
    expect(putDown).toBe(false);
    expect(h.mh.rackedSticks()).toContain('stick-0');
    expect(h.throwStick('host', 'stick-0')).toBe(true);
  });
});

describe('MatchHost — simplified rules (Förenklat, 2026-11-01)', () => {
  /** The rest of `side`'s sticks land harmlessly; the round ends. */
  function finishTurn(
    h: ReturnType<typeof host>,
    side: 'host' | 'guest',
    from: number,
  ) {
    for (let i = from; i < 6; i++) {
      expect(h.throwStick(side, `stick-${i}`)).toBe(true);
      h.world.land(`stick-${i}`, [i * 0.3 - 0.8, 0.022, -3.5]);
      h.run(0.6);
    }
    h.run(1);
  }

  it('a felled field kubb is laid beside the court and never queued', () => {
    const h = host();
    h.mh.setSimplified(true);
    h.mh.setPlayers(['host', 'guest']);
    expect(h.last()?.simplified).toBe(true);
    h.run(1.2);
    playOpening(h);
    // Host fells guest baseline kubb-0: tossed over as usual.
    expect(h.throwStick('host', 'stick-0')).toBe(true);
    h.world.land('kubb-0', [-1.2, 0.035, -6.1]);
    h.world.land('stick-0', [0, 0.022, -5.8]);
    h.run(0.8);
    finishTurn(h, 'host', 1);
    expect(h.last()?.inkastQueue).toEqual([{ kubbId: 'kubb-0', attempt: 1 }]);
    h.mh.onThrow('guest', {
      pieceId: 'kubb-0',
      position: [0, 1, -6.4],
      quaternion: UP,
      linearVelocity: [0, 3, 5],
      angularVelocity: [0, 0, 0],
    });
    h.world.land('kubb-0', [0.5, 0.035, -2]);
    h.run(0.8);
    expect(h.last()?.fieldKubbs.map((k) => k.kubbId)).toEqual(['kubb-0']);
    // The guest fells the field kubb: retired, not queued.
    expect(h.throwStick('guest', 'stick-0')).toBe(true);
    h.world.land('kubb-0', [0.6, 0.035, -2.1]);
    h.world.land('stick-0', [0, 0.022, -2.4]);
    h.run(0.8);
    const s = h.last();
    expect(s?.retired).toEqual(['kubb-0']);
    expect(s?.felledThisTurn).toEqual([]);
    expect(s?.fieldKubbs).toEqual([]);
    const pose = h.world.poses.get('kubb-0');
    // Backyard court (3 × 6): beside the +x side line, level with the centre.
    expect(pose?.position[0]).toBeGreaterThan(1.5);
    expect(pose?.position[0]).toBeLessThan(3);
    expect(pose?.position[2]).toBeCloseTo(-3, 1);
    expect(pose?.position[1]).toBeLessThan(0.05);
    expect(h.gates.map((g) => g.message)).toContain('kubb retired');
    finishTurn(h, 'guest', 1);
    const next = h.last();
    expect(next?.currentTurn).toBe('host');
    expect(next?.inkastQueue).toEqual([]);
    expect(next?.phase).toBe('throwing');
    // Still lying out of play: it is never reported felled again.
    h.run(2);
    expect(h.last()?.retired).toEqual(['kubb-0']);
    expect(h.world.poses.get('kubb-0')).toBe(pose);
  });

  it('a change mid-match waits for the next match', () => {
    const h = host();
    h.mh.setPlayers(['host', 'guest']);
    h.run(1.2);
    expect(h.throwStick('host', 'stick-0')).toBe(true);
    h.world.land('kubb-0', [-1.2, 0.035, -6.1]);
    h.world.land('stick-0', [0, 0.022, -5.8]);
    h.run(0.8);
    expect(h.last()?.felledThisTurn).toEqual(['kubb-0']);
    h.mh.setSimplified(true);
    expect(h.last()?.simplified).toBe(false);
    h.mh.reset();
    expect(h.last()?.simplified).toBe(true);
    h.mh.setSimplified(false); // fresh: at once
    expect(h.last()?.simplified).toBe(false);
  });
});
