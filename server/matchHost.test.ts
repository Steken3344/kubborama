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
  const mh = new MatchHost(world, mode, {
    matchState: (s) => states.push(s),
    roundEnded: (r) => rounds.push(r),
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
    run,
    throwStick,
    last: () => states.at(-1) ?? null,
  };
}

/** The thrower's six sticks: throw each, land it on the grass. */
function throwTurn(h: ReturnType<typeof host>, side: 'host' | 'guest') {
  for (let i = 0; i < 6; i++) {
    expect(h.throwStick(side, `stick-${i}`)).toBe(true);
    h.world.land(`stick-${i}`, [i * 0.3 - 0.8, 0.022, -3.5]);
    h.run(0.6);
  }
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
