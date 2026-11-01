import { describe, expect, it } from 'vitest';
import {
  courtPresets,
  defaultCourtPreset,
  kubbTable,
  stickRack,
} from './config.js';
import scene from '../public/scenes/main.iwsdk.scene.json' with { type: 'json' };

/**
 * The scene JSON writes the tables' poses and colliders out by hand;
 * src/data/kubb-table.json and stick-rack.json are what the rules place
 * kubbs and sticks by. They must agree, or pieces float or sink (review,
 * 2026-11-01). The far tables are the near ones mirrored onto the far
 * baseline of the court the scene is authored for.
 */
interface SceneNode {
  id: string;
  transform?: { position?: number[] };
  components?: { PhysicsShape?: { dimensions: number[] } };
}
const nodes = new Map(
  (scene.nodes as SceneNode[]).map((n) => [n.id, n] as const),
);
const pos = (id: string): number[] => nodes.get(id)?.transform?.position ?? [];
const dims = (id: string): number[] =>
  nodes.get(id)?.components?.PhysicsShape?.dimensions ?? [];
const farZ = -courtPresets[defaultCourtPreset].lengthM;

describe('scene tables match their data', () => {
  it('the kubb table and its collider top sit where the rules stand kubbs', () => {
    expect(pos('kubb-table')).toEqual([kubbTable.xM, 0, kubbTable.zM]);
    const [w = 0, h = 0, d = 0] = dims('kubb-table-collider');
    expect(w).toBeCloseTo(kubbTable.widthM);
    expect(d).toBeCloseTo(kubbTable.depthM);
    const [cx = 0, cy = 0, cz = 0] = pos('kubb-table-collider');
    expect(cy + h / 2).toBeCloseTo(kubbTable.topM);
    expect([cx, cz]).toEqual([kubbTable.xM, kubbTable.zM]);
  });

  it('the stick rack collider top is the plank top the sticks lie on', () => {
    const [, h = 0] = dims('stick-rack-collider');
    const [cx = 0, cy = 0, cz = 0] = pos('stick-rack-collider');
    expect(cy + h / 2).toBeCloseTo(stickRack.plankTopM);
    expect([cx, cz]).toEqual([stickRack.xM, stickRack.zM]);
  });

  it('every far table is its near one mirrored onto the far baseline', () => {
    for (const [near, far] of [
      ['kubb-table', 'kubb-table-2'],
      ['kubb-table-collider', 'kubb-table-2-collider'],
      ['stick-rack', 'stick-rack-2'],
      ['stick-rack-collider', 'stick-rack-2-collider'],
    ] as const) {
      const [nx = 0, ny = 0, nz = 0] = pos(near);
      const [fx = 0, fy = 0, fz = 0] = pos(far);
      expect(fx).toBeCloseTo(-nx);
      expect(fy).toBeCloseTo(ny);
      expect(fz).toBeCloseTo(farZ - nz);
      expect(dims(far)).toEqual(dims(near));
    }
  });
});
