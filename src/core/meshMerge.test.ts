import { describe, expect, it } from 'vitest';
import { materialLookKey, mergeMeshParts } from './meshMerge.js';
import type { MeshPart } from './meshMerge.js';

/** Column-major 4×4 (three.js `Matrix4.elements` order). */
const translate = (x: number, y: number, z: number) => [
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  0,
  0,
  0,
  1,
  0,
  x,
  y,
  z,
  1,
];
/** Half a turn about y, scaled by 2, moved to (1, 0, 0). */
const yawHalfScaled2 = [-2, 0, 0, 0, 0, 2, 0, 0, 0, 0, -2, 0, 1, 0, 0, 1];

const triangle = (matrix: number[]): MeshPart => ({
  position: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  normal: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  uv: [0, 0, 1, 0, 0, 1],
  index: [0, 1, 2],
  matrix,
});

describe('mergeMeshParts', () => {
  it('concatenates parts and offsets the second part’s indices', () => {
    const merged = mergeMeshParts([
      triangle(translate(0, 0, 0)),
      triangle(translate(5, 0, 0)),
    ]);
    expect(merged.position.length).toBe(18);
    expect([...merged.index]).toEqual([0, 1, 2, 3, 4, 5]);
    expect([...merged.uv]).toEqual([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  });

  it('moves positions into world space', () => {
    const merged = mergeMeshParts([triangle(translate(5, 2, -1))]);
    expect([...merged.position.slice(3, 6)]).toEqual([6, 2, -1]);
  });

  it('rotates normals and keeps them unit length under uniform scale', () => {
    const merged = mergeMeshParts([triangle(yawHalfScaled2)]);
    const [px = 0, py = 0, pz = 0] = merged.position.slice(3, 6);
    expect(px).toBeCloseTo(-1, 9);
    expect(py).toBeCloseTo(0, 9);
    expect(pz).toBeCloseTo(0, 9);
    const [nx = 0, ny = 0, nz = 0] = merged.normal;
    expect(nx).toBeCloseTo(0, 9);
    expect(ny).toBeCloseTo(0, 9);
    expect(nz).toBeCloseTo(-1, 9);
  });

  it('is empty for no parts', () => {
    const merged = mergeMeshParts([]);
    expect(merged.position.length).toBe(0);
    expect(merged.index.length).toBe(0);
  });
});

describe('materialLookKey', () => {
  const grass = {
    type: 'MeshBasicMaterial',
    name: 'grass',
    colorHex: '4caf50',
    emissiveHex: '',
    mapId: '',
    vertexColors: false,
    flatShading: false,
    transparent: false,
    opacity: 1,
    alphaTest: 0,
    side: 0,
  };

  it('groups identical looks together', () => {
    expect(materialLookKey({ ...grass })).toBe(materialLookKey(grass));
  });

  it('keeps the same name with a different texture or opacity apart', () => {
    expect(materialLookKey({ ...grass, mapId: 'tex-1' })).not.toBe(
      materialLookKey(grass),
    );
    expect(materialLookKey({ ...grass, opacity: 0.5 })).not.toBe(
      materialLookKey(grass),
    );
    expect(materialLookKey({ ...grass, colorHex: '000000' })).not.toBe(
      materialLookKey(grass),
    );
  });
});
