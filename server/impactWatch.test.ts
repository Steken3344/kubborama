import { describe, expect, it } from 'vitest';
import { pieces } from '../src/config.js';
import { createImpactWatch } from '../src/core/impactWatch.js';
import type { ImpactItem } from '../src/core/impactWatch.js';
import { NETWORKED_PIECE_IDS } from '../src/core/pieceSync.js';
import { MatchHost } from './matchHost.js';
import { createPhysicsWorld } from './physicsWorld.js';

const DT = 1 / 60;

/** Real Havok: a stick thrown at a baseline kubb — what the server
 * reports (2026-11-01: thrown sticks had gone silent in server mode). */
describe('server impacts with real physics', () => {
  it('a stick striking a kubb is heard; the release and the rack are not', async () => {
    const world = await createPhysicsWorld('backyard');
    const host = new MatchHost(world, 'simple', {
      matchState: () => undefined,
      roundEnded: () => undefined,
      notice: () => undefined,
      gate: () => undefined,
    });
    host.setPlayers(['host']);
    const watch = createImpactWatch({
      thresholdMps: pieces.throw.impactThresholdMps,
      teleportM: 0.2,
      cooldownS: 0.08,
    });
    const out: ImpactItem[] = [];
    let t = 0;
    const step = () => {
      world.step(DT);
      host.tick(DT);
      t += DT;
      for (const p of world.snapshot(NETWORKED_PIECE_IDS)) {
        const v = world.linearVelocity(p.id);
        if (v) watch.observe(p.id, p.position, v, t, DT, out);
      }
    };
    for (let i = 0; i < 90; i++) step();
    expect(out, 'pieces settling at the start').toHaveLength(0);
    const kubb = world.snapshot(['kubb-0'])[0]?.position ?? [0, 0, -6];
    const from: [number, number, number] = [kubb[0], 1, -0.3];
    const tFlight = Math.abs(kubb[2] - from[2]) / 7;
    expect(
      host.onThrow('host', {
        pieceId: 'stick-0',
        position: from,
        quaternion: [0, 0, 0, 1],
        linearVelocity: [
          0,
          (0.15 - 1 + 4.905 * tFlight * tFlight) / tFlight,
          (kubb[2] - from[2]) / tFlight,
        ],
        angularVelocity: [-22, 0, 0],
      }),
    ).toBe(true);
    step();
    expect(out, 'the jump to the release point').toHaveLength(0);
    for (let i = 0; i < 240; i++) step();
    world.dispose();
    const ids = new Set(out.map((i) => i.id));
    expect(ids.has('stick-0'), JSON.stringify(out)).toBe(true);
    // The struck kubb itself only tips (|Δv| under the threshold); its
    // fall is the KubbFelled knock and chime, not an impact.
    expect(out.length).toBeLessThan(20);
  });
});
