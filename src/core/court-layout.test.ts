import { describe, expect, it } from 'vitest';
import { computeCourtLayout } from './court-layout.js';
import type { CourtPreset, PieceDims } from './court-layout.js';

const backyard: CourtPreset = { widthM: 3, lengthM: 6 };
const dims: PieceDims = {
  kingHeightM: 0.3,
  kubbHeightM: 0.15,
  stakeHeightM: 0.3,
  stickRadiusM: 0.022,
};

describe('computeCourtLayout', () => {
  it('places the king at court center, on the far baseline axis', () => {
    const layout = computeCourtLayout(backyard, dims, 1);
    expect(layout.kingPosition).toEqual([0, dims.kingHeightM / 2, -3]);
  });

  it('places 10 kubbs, 5 evenly spaced on each (short) baseline', () => {
    const layout = computeCourtLayout(backyard, dims, 1);
    expect(layout.kubbPositions).toHaveLength(10);
    for (const [x, y] of layout.kubbPositions) {
      expect(y).toBeCloseTo(dims.kubbHeightM / 2);
      expect(x).toBeGreaterThan(-backyard.widthM / 2);
      expect(x).toBeLessThan(backyard.widthM / 2);
    }
    // First 5 are the far baseline, last 5 are the near (player's) baseline.
    const far = layout.kubbPositions.slice(0, 5);
    const near = layout.kubbPositions.slice(5);
    for (const [, , z] of far) {
      expect(z).toBeCloseTo(-backyard.lengthM);
    }
    for (const [, , z] of near) {
      expect(z).toBeGreaterThan(-1);
      expect(z).toBeLessThan(0);
    }

    function expectEvenlySpaced(row: typeof far): void {
      const xs = row.map(([x]) => x);
      const gaps: number[] = [];
      for (let i = 1; i < xs.length; i++) {
        const curr = xs[i];
        const prev = xs[i - 1];
        if (curr === undefined || prev === undefined) {
          throw new Error('unreachable: index within bounds');
        }
        gaps.push(curr - prev);
      }
      const [firstGap] = gaps;
      if (firstGap === undefined) {
        throw new Error('unreachable: row is non-empty');
      }
      for (const gap of gaps) {
        expect(gap).toBeCloseTo(firstGap);
      }
    }
    expectEvenlySpaced(far);
    expectEvenlySpaced(near);
    // Both baselines use the same x layout (mirrored court).
    expect(near.map(([x]) => x)).toEqual(far.map(([x]) => x));
  });

  it('places 4 corner stakes at the court corners, not along the lines', () => {
    const layout = computeCourtLayout(backyard, dims, 1);
    expect(layout.stakePositions).toHaveLength(4);
    const xs = layout.stakePositions.map(([x]) => x);
    const zs = layout.stakePositions.map(([, , z]) => z);
    expect(new Set(xs.map((x) => Math.round(x * 1000)))).toEqual(
      new Set([
        Math.round((-backyard.widthM / 2) * 1000),
        Math.round((backyard.widthM / 2) * 1000),
      ]),
    );
    expect(new Set(zs.map((z) => Math.round(z * 1000)))).toEqual(
      new Set([0, Math.round(-backyard.lengthM * 1000)]),
    );
  });

  it('scatters 6 sticks near the player (near) baseline, inside the court width', () => {
    const layout = computeCourtLayout(backyard, dims, 1);
    expect(layout.stickSpawnPositions).toHaveLength(6);
    for (const { position, yawRad } of layout.stickSpawnPositions) {
      const [x, y, z] = position;
      expect(y).toBeCloseTo(dims.stickRadiusM);
      expect(z).toBeLessThan(0);
      expect(z).toBeGreaterThan(-1.0);
      expect(x).toBeGreaterThan(-backyard.widthM / 2);
      expect(x).toBeLessThan(backyard.widthM / 2);
      expect(yawRad).toBeGreaterThanOrEqual(0);
      expect(yawRad).toBeLessThan(Math.PI * 2);
    }
  });

  it('is deterministic for a given seed', () => {
    const a = computeCourtLayout(backyard, dims, 7);
    const b = computeCourtLayout(backyard, dims, 7);
    expect(a).toEqual(b);
  });

  it('produces a different stick scatter for a different seed', () => {
    const a = computeCourtLayout(backyard, dims, 7);
    const b = computeCourtLayout(backyard, dims, 8);
    expect(a.stickSpawnPositions).not.toEqual(b.stickSpawnPositions);
  });

  it('scales with a different court preset (tournament 8x5)', () => {
    const tournament: CourtPreset = { widthM: 5, lengthM: 8 };
    const layout = computeCourtLayout(tournament, dims, 1);
    expect(layout.kingPosition).toEqual([0, dims.kingHeightM / 2, -4]);
    for (const [, , z] of layout.kubbPositions.slice(0, 5)) {
      expect(z).toBeCloseTo(-8);
    }
    for (const [, , z] of layout.kubbPositions.slice(5)) {
      expect(z).toBeGreaterThan(-1);
      expect(z).toBeLessThan(0);
    }
  });
});
