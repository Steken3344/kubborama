/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  courtLayout,
  defaultCourtPreset,
  STICK_LAYOUT_SEED,
} from './config.js';

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

const layout = courtLayout(defaultCourtPreset, STICK_LAYOUT_SEED);

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

  it('all 6 stick spawn positions match (rotation is a separate node-transform concern)', () => {
    layout.stickSpawnPositions.forEach(({ position: expected }, i) => {
      expectPositionClose(nodePosition(`stick-${i}`), expected);
    });
  });
});
