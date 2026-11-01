import { describe, expect, it } from 'vitest';
import { stoneWall } from '../src/config.js';
import { MatchHost } from './matchHost.js';
import { createPhysicsWorld } from './physicsWorld.js';
import type { ThrowInput } from './physicsWorld.js';

const DT = 1 / 60;
/** The stone wall's inner face, from the origin. */
const WALL_INNER_M = stoneWall.outerSideM / 2 - stoneWall.thicknessM;

/** Where a wild throw ends up after it has had time to land (real Havok). */
async function restingPlace(
  input: ThrowInput,
): Promise<[number, number, number]> {
  const world = await createPhysicsWorld('backyard');
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
  for (let t = 0; t < 8; t += DT) {
    world.step(DT);
    host.tick(DT);
  }
  const [p] = world.snapshot([input.pieceId]);
  world.dispose();
  if (!p) throw new Error('no stick');
  return p.position;
}

const inside = (p: [number, number, number]) =>
  p[1] > -0.5 &&
  Math.abs(p[0]) < WALL_INNER_M + 0.05 &&
  Math.abs(p[2]) < WALL_INNER_M + 0.05;

describe('wild throws stay inside the stone wall (edge cases, 2026-11-01)', () => {
  it('a hard throw backwards over the shoulder stops at the wall', async () => {
    const p = await restingPlace({
      pieceId: 'stick-0',
      position: [0.2, 1.0, 1.4],
      quaternion: [0, 0, 0, 1],
      linearVelocity: [0, 6, 14],
      angularVelocity: [0, 0, 0],
    });
    expect(inside(p), `rests at ${p.join(', ')}`).toBe(true);
  });

  it('the hardest sideways throw the protocol allows stays on the ground', async () => {
    const p = await restingPlace({
      pieceId: 'stick-1',
      position: [0.2, 1.0, 1.4],
      quaternion: [0, 0, 0, 1],
      linearVelocity: [28, 8, 0],
      angularVelocity: [0, 0, 0],
    });
    expect(inside(p), `rests at ${p.join(', ')}`).toBe(true);
  });
});
