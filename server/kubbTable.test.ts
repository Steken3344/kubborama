import { describe, expect, it } from 'vitest';
import { getCourtPreset, inkastTableLayout } from '../src/config.js';
import { courtHalves, inkastRackPosition } from '../src/core/inkast.js';
import { createPhysicsWorld } from './physicsWorld.js';

const DT = 1 / 60;

describe('kubb table (2026-11-01): queued kubbs stand on it, both sides, both courts', () => {
  for (const preset of ['backyard', 'tournament'] as const) {
    for (const side of ['host', 'guest'] as const) {
      it(`${preset} ${side}: every slot stays up on the table top`, async () => {
        const world = await createPhysicsWorld(preset);
        const halves = courtHalves(getCourtPreset(preset));
        const count = 7; // two rows
        for (let slot = 0; slot < count; slot++) {
          world.setPose(`kubb-${String(slot)}`, {
            position: inkastRackPosition(
              halves,
              side,
              slot,
              count,
              inkastTableLayout(),
            ),
            quaternion: [0, 0, 0, 1],
          });
        }
        for (let t = 0; t < 1.5; t += DT) world.step(DT);
        const ids = Array.from(
          { length: count },
          (_, i) => `kubb-${String(i)}`,
        );
        for (const pose of world.snapshot(ids)) {
          expect(pose.position[1]).toBeGreaterThan(0.85); // on the 0.8 m top
          expect(pose.position[1]).toBeLessThan(0.9);
        }
        world.dispose();
      });
    }
  }
});
