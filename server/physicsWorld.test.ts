import { describe, expect, it } from 'vitest';
import { createPhysicsWorld } from './physicsWorld.js';

const DT = 1 / 60;

describe('server physics world (MP5)', () => {
  it('lays out the tournament court (kubbs at the 8 m far baseline)', async () => {
    const world = await createPhysicsWorld('tournament');
    const [kubb0, king] = world.snapshot(['kubb-0', 'king']);
    expect(kubb0?.position[2]).toBeCloseTo(-8, 1);
    expect(king?.position[2]).toBeCloseTo(-4, 1);
  });

  it('a thrown stick flies, lands on the court and comes to rest', async () => {
    const world = await createPhysicsWorld('backyard');
    world.applyThrow({
      pieceId: 'stick-0',
      position: [0.2, 1.0, -0.3],
      quaternion: [0, 0, 0, 1],
      linearVelocity: [0, 3.2, -6.0],
      angularVelocity: [-22, 0, 0],
    });
    let restS = 0;
    let t = 0;
    for (; t < 8 && restS < 0.5; t += DT) {
      world.step(DT);
      const [lin = 1, ang = 1] = world.speeds('stick-0') ?? [];
      restS = lin < 0.05 && ang < 0.3 ? restS + DT : 0;
    }
    const [stick] = world.snapshot(['stick-0']);
    // Ranges, never exact positions (CLAUDE.md): a ~6 m underhand throw.
    expect(t).toBeLessThan(8);
    expect(stick?.position[1]).toBeGreaterThan(0);
    expect(stick?.position[1]).toBeLessThan(0.1);
    expect(stick?.position[2]).toBeGreaterThan(-7.5);
    expect(stick?.position[2]).toBeLessThan(-4.5);
  });

  it('keeps the untouched pieces standing', async () => {
    const world = await createPhysicsWorld('backyard');
    for (let i = 0; i < 120; i++) {
      world.step(DT);
    }
    const [kubb5] = world.snapshot(['kubb-5']);
    expect(kubb5?.position[1]).toBeCloseTo(0.075, 2);
  });
});

describe('dispose (review, 2026-09-27)', () => {
  it('releases the world once and is safe to call twice', async () => {
    const world = await createPhysicsWorld('backyard');
    world.dispose();
    expect(() => world.dispose()).not.toThrow();
  });
  it('many build/dispose cycles do not break later worlds', async () => {
    for (let i = 0; i < 5; i++) {
      (await createPhysicsWorld('backyard')).dispose();
    }
    const fresh = await createPhysicsWorld('backyard');
    expect(fresh.snapshot(['king'])[0]?.position[2]).toBeCloseTo(-3, 1);
  });
});
