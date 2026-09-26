/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { courtLayout, defaultCourtPreset, stickRackLayout } from './config.js';

/**
 * Scene JSON can't call functions, so every piece position in
 * public/scenes/main.iwsdk.scene.json is a literal copy of what
 * courtLayout() computes. This test is the sync guard: if
 * src/data/court-presets.json or pieces.json ever changes, this fails
 * loudly instead of the scene silently going stale. Regenerate the
 * scene JSON's positions (see docs/DECISIONS.md's M1 entry for the
 * dump-layout approach) and update the scene file to match.
 */

const sceneJsonPath = fileURLToPath(
  new URL('../public/scenes/main.iwsdk.scene.json', import.meta.url),
);
const scene = JSON.parse(readFileSync(sceneJsonPath, 'utf-8')) as {
  nodes: Array<{ id: string; transform?: { position?: number[] } }>;
};

function nodePosition(id: string): number[] {
  const node = scene.nodes.find((n) => n.id === id);
  const position = node?.transform?.position;
  if (!position) {
    throw new Error(`scene node "${id}" or its position is missing`);
  }
  return position;
}

function expectPositionClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let axis = 0; axis < expected.length; axis++) {
    const a = actual[axis];
    const e = expected[axis];
    if (a === undefined || e === undefined) {
      throw new Error('unreachable: axis within bounds');
    }
    expect(a).toBeCloseTo(e, 3);
  }
}

const layout = courtLayout(defaultCourtPreset);
const stickLayout = stickRackLayout();

describe('scene JSON stays in sync with config.ts courtLayout()', () => {
  it('king position matches', () => {
    expectPositionClose(nodePosition('king'), layout.kingPosition);
  });

  it('all 5 kubb positions match', () => {
    layout.kubbPositions.forEach((expected, i) => {
      expectPositionClose(nodePosition(`kubb-${i}`), expected);
    });
  });

  it('all 4 corner stake positions match', () => {
    const ids = [
      'corner-stake-near-left',
      'corner-stake-near-right',
      'corner-stake-far-left',
      'corner-stake-far-right',
    ];
    layout.stakePositions.forEach((expected, i) => {
      const id = ids[i];
      if (id === undefined) {
        throw new Error('unreachable: ids has 4 entries');
      }
      expectPositionClose(nodePosition(id), expected);
    });
  });

  it('all 6 stick rack positions match (rotation is a separate node-transform concern)', () => {
    stickLayout.forEach(({ position: expected }, i) => {
      expectPositionClose(nodePosition(`stick-${i}`), expected);
    });
  });
});

describe('scenery keeps the play area clear (2026-09-26)', () => {
  // Erik: on the 8 m court "pinnarna och bordet hamnar i ett träd" —
  // tree-18 stood where the far stick rack and the inkast rack are.
  // Every decoration collider must stay out of the LARGEST court plus
  // the rack/inkast zones behind both baselines (±0.8 m wide, 1.7 m
  // deep — the rack sits ~1.09 m behind, the inkast rack 0.5 m).
  const largest = { widthM: 5, lengthM: 8 };
  const zones = [
    {
      name: 'court',
      x0: -largest.widthM / 2,
      x1: largest.widthM / 2,
      z0: -largest.lengthM,
      z1: 0,
    },
    {
      name: 'far racks',
      x0: -0.8,
      x1: 0.8,
      z0: -largest.lengthM - 1.7,
      z1: -largest.lengthM,
    },
    { name: 'near racks', x0: -0.8, x1: 0.8, z0: 0, z1: 1.7 },
  ];
  const decorations = (
    scene.nodes as Array<{
      id: string;
      transform?: { position?: number[]; rotationDeg?: number[] };
      components?: { PhysicsShape?: { shape: string; dimensions: number[] } };
    }>
  ).filter((n) => /^(tree|rock|bush|cliff|campsite)-/u.test(n.id));

  it('has decorations to check', () => {
    expect(decorations.length).toBeGreaterThan(20);
  });

  it.each(decorations.map((n) => [n.id, n] as const))('%s', (_id, n) => {
    const shape = n.components?.PhysicsShape;
    const [x = 0, , z = 0] = n.transform?.position ?? [];
    if (!shape) {
      return;
    }
    const [d0 = 0, , d2 = 0] = shape.dimensions;
    const yawRad = ((n.transform?.rotationDeg?.[1] ?? 0) * Math.PI) / 180;
    const c = Math.abs(Math.cos(yawRad));
    const s = Math.abs(Math.sin(yawRad));
    // Cylinder: radius; box: half extents of its yaw-rotated footprint.
    const hx = shape.shape === 'Cylinder' ? d0 : (d0 * c + d2 * s) / 2;
    const hz = shape.shape === 'Cylinder' ? d0 : (d0 * s + d2 * c) / 2;
    for (const zone of zones) {
      const overlaps =
        x + hx > zone.x0 &&
        x - hx < zone.x1 &&
        z + hz > zone.z0 &&
        z - hz < zone.z1;
      expect(overlaps, `${n.id} overlaps the ${zone.name}`).toBe(false);
    }
  });
});
