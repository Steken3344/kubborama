import { describe, expect, it } from 'vitest';
import { farBaselineZ } from './court-layout.js';
import {
  initialMatchState,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';
import { sinBinPlacements } from './matchSinBin.js';
import { sinBinSlotPosition } from './sinBin.js';

const OPTS = {
  sinBin: { xM: 3.3, startZM: -0.3, spacingM: 0.14 },
  kubbHeightM: 0.15,
  farZ: -6,
};

describe('farBaselineZ', () => {
  it('is minus the court length for every preset', () => {
    expect(farBaselineZ({ widthM: 3, lengthM: 6 })).toBe(-6);
    expect(farBaselineZ({ widthM: 5, lengthM: 8 })).toBe(-8);
    expect(farBaselineZ({ widthM: 2, lengthM: 5 })).toBe(-5);
  });
});

describe('sinBinPlacements', () => {
  it('is empty for a fresh match', () => {
    expect(sinBinPlacements(initialMatchState(), OPTS)).toEqual([]);
  });

  it('places guest-side kubbs (felled by the host) on the mirrored far row, slot = list index', () => {
    let s = withKubbFelled(initialMatchState(), 'kubb-3');
    s = withKubbFelled(s, 'kubb-0');
    const placements = sinBinPlacements(s, OPTS);
    expect(placements.map((p) => p.kubbId)).toEqual(['kubb-3', 'kubb-0']);
    const [slot0, slot1] = placements;
    // Host-side slot 0 would be (3.3, 0.075, -0.3); mirrored: x flips,
    // z = farZ - z.
    expect(slot0?.position[0]).toBeCloseTo(-3.3);
    expect(slot0?.position[1]).toBeCloseTo(0.075);
    expect(slot0?.position[2]).toBeCloseTo(-6 - -0.3);
    expect(slot1?.position[2]).toBeCloseTo(-6 - (-0.3 - 0.14));
    // 180° yaw of the identity quaternion (sign of zero irrelevant).
    expect(slot0?.quaternion.map((q) => Math.abs(q))).toEqual([0, 1, 0, 0]);
  });

  it('places host-side kubbs (felled by the guest) on the near row, upright', () => {
    let s = withTurnAdvanced(initialMatchState());
    s = withKubbFelled(s, 'kubb-9');
    const [p] = sinBinPlacements(s, OPTS);
    expect(p?.kubbId).toBe('kubb-9');
    expect(p?.position).toEqual(sinBinSlotPosition(0, 0.15, OPTS.sinBin));
    expect(p?.quaternion).toEqual([0, 0, 0, 1]);
  });

  it('skips an id listed under the wrong side (defensive against a bad snapshot)', () => {
    const s = {
      ...initialMatchState(),
      felledKubbIds: { host: [], guest: ['kubb-7', 'kubb-1'] },
    };
    const placements = sinBinPlacements(s, OPTS);
    expect(placements.map((p) => p.kubbId)).toEqual(['kubb-1']);
    // Still slot 1 — the slot is the list index, not a compacted count.
    expect(placements[0]?.position[2]).toBeCloseTo(-6 - (-0.3 - 0.14));
  });

  it('derives slots from list position, so a 3-id first snapshot yields slots 0,1,2', () => {
    const s = {
      ...initialMatchState(),
      felledKubbIds: { host: [], guest: ['kubb-1', 'kubb-4', 'kubb-2'] },
    };
    const zs = sinBinPlacements(s, OPTS).map((p) => p.position[2]);
    expect(zs).toHaveLength(3);
    expect((zs[1] ?? 0) - (zs[0] ?? 0)).toBeCloseTo(0.14);
    expect((zs[2] ?? 0) - (zs[1] ?? 0)).toBeCloseTo(0.14);
  });
});
