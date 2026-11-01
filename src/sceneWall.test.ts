import { describe, expect, it } from 'vitest';
import { stoneWall } from './config.js';
import scene from '../public/scenes/main.iwsdk.scene.json' with { type: 'json' };

/**
 * The stone wall is only 0.6 m high and has no collider of its own:
 * four tall invisible boxes on its line keep wild throws inside the
 * garden (edge cases, 2026-11-01: a stick thrown hard backwards landed
 * outside the wall in the air beyond it; one thrown sideways at the
 * protocol's 30 m/s bound fell off the ground). They must stand where
 * src/data/stone-wall.json builds the wall.
 */
interface SceneNode {
  id: string;
  transform?: { position?: number[] };
  components?: { PhysicsShape?: { dimensions: number[] } };
}
const nodes = new Map(
  (scene.nodes as SceneNode[]).map((n) => [n.id, n] as const),
);

describe('boundary colliders follow the stone wall', () => {
  const centre = stoneWall.outerSideM / 2 - stoneWall.thicknessM / 2;
  const h = stoneWall.colliderHeightM;
  const cases: Array<[string, number[], number[]]> = [
    [
      'north',
      [0, h / 2, -centre],
      [stoneWall.outerSideM, h, stoneWall.thicknessM],
    ],
    [
      'south',
      [0, h / 2, centre],
      [stoneWall.outerSideM, h, stoneWall.thicknessM],
    ],
    [
      'east',
      [centre, h / 2, 0],
      [stoneWall.thicknessM, h, stoneWall.outerSideM],
    ],
    [
      'west',
      [-centre, h / 2, 0],
      [stoneWall.thicknessM, h, stoneWall.outerSideM],
    ],
  ];
  it.each(cases)('%s side', (name, position, dimensions) => {
    const node = nodes.get(`boundary-collider-${name}`);
    expect(node?.transform?.position).toEqual(position);
    expect(node?.components?.PhysicsShape?.dimensions).toEqual(dimensions);
  });

  it('stands well above a person (a lob has to be absurd to clear it)', () => {
    expect(h).toBeGreaterThanOrEqual(8);
  });
});
