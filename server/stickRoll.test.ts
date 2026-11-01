import { describe, expect, it } from 'vitest';
import { fromAxisAngle } from '../src/core/quat.js';
import { MatchHost } from './matchHost.js';
import { createPhysicsWorld } from './physicsWorld.js';
import type { PhysicsWorld } from './physicsWorld.js';
import type { ThrowInput } from './physicsWorld.js';

const DT = 1 / 60;

/** Real Havok + the server's rules (which brake a landed stick): how far
 * does the stick travel along the ground after it first touches down? */
async function rollAfterLanding(input: ThrowInput): Promise<{
  rollM: number;
  restedAfterS: number;
}> {
  const world: PhysicsWorld = await createPhysicsWorld('backyard');
  const host = new MatchHost(world, 'simple', {
    matchState: () => undefined,
    roundEnded: () => undefined,
    notice: () => undefined,
    gate: () => undefined,
  });
  host.setPlayers(['host']);
  for (let t = 0; t < 1.2; t += DT) {
    world.step(DT);
    host.tick(DT);
  }
  expect(host.onThrow('host', input)).toBe(true);
  let landed: [number, number] | null = null;
  let last: [number, number] = [0, 0];
  let restS = 0;
  let t = 0;
  for (; t < 10 && restS < 0.5; t += DT) {
    world.step(DT);
    host.tick(DT);
    const [p] = world.snapshot(['stick-0']);
    if (!p) break;
    last = [p.position[0], p.position[2]];
    if (!landed && p.position[1] < 0.06) landed = [...last];
    const [lin = 1, ang = 1] = world.speeds('stick-0') ?? [];
    restS = lin < 0.05 && ang < 0.3 ? restS + DT : 0;
  }
  world.dispose();
  const from = landed ?? last;
  return {
    rollM: Math.hypot(last[0] - from[0], last[1] - from[1]),
    restedAfterS: t,
  };
}

describe('sticks on grass barely roll (Erik, 2026-11-01)', () => {
  it('an underhand throw stops close to where it lands', async () => {
    const r = await rollAfterLanding({
      pieceId: 'stick-0',
      position: [0.2, 1.0, -0.3],
      quaternion: [0, 0, 0, 1],
      linearVelocity: [0, 3.2, -6.0],
      angularVelocity: [-22, 0, 0],
    });
    expect(r.rollM).toBeLessThan(0.35);
  });

  it('a stick landing flat with sideways speed does not roll away', async () => {
    // Lying along z, moving sideways in x and rolling about its own axis.
    const r = await rollAfterLanding({
      pieceId: 'stick-0',
      position: [0, 0.3, 0.3],
      quaternion: fromAxisAngle([1, 0, 0], Math.PI / 2),
      linearVelocity: [3, 0, 0],
      angularVelocity: [0, 0, -60],
    });
    expect(r.rollM).toBeLessThan(0.35);
  });
});
