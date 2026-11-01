import { describe, expect, it } from 'vitest';
import {
  clampIntoHalf,
  courtHalves,
  halfBounds,
  halfOfZ,
  inkastRackPosition,
  isLegalLanding,
  nudgeClear,
  RETIRED_KUBB_QUATERNION,
  retiredKubbPosition,
} from './inkast.js';

const h = courtHalves({ widthM: 5, lengthM: 8 });

describe('courtHalves', () => {
  it('derives the lines of a 5 × 8 court', () => {
    expect(h).toEqual({
      halfWidthM: 2.5,
      nearBaselineZ: 0,
      centreZ: -4,
      farBaselineZ: -8,
    });
    expect(halfBounds(h, 'host')).toEqual({ minZ: -4, maxZ: 0 });
    expect(halfBounds(h, 'guest')).toEqual({ minZ: -8, maxZ: -4 });
  });
  it('counts the centre line as the host half', () => {
    expect(halfOfZ(h, -4)).toBe('host');
    expect(halfOfZ(h, -4.01)).toBe('guest');
  });
});

describe('isLegalLanding', () => {
  it('accepts inside and on the lines of the target half', () => {
    expect(isLegalLanding(h, 'host', 0, -2)).toBe(true);
    expect(isLegalLanding(h, 'host', 2.5, -4)).toBe(true);
    expect(isLegalLanding(h, 'guest', -2.5, -8)).toBe(true);
  });
  it('rejects the wrong half, beyond a sideline or behind the baseline', () => {
    expect(isLegalLanding(h, 'host', 0, -5)).toBe(false);
    expect(isLegalLanding(h, 'host', 2.6, -2)).toBe(false);
    expect(isLegalLanding(h, 'guest', 0, -8.1)).toBe(false);
  });
});

describe('clampIntoHalf', () => {
  it('pulls an outside point just inside every edge', () => {
    expect(clampIntoHalf(h, 'host', 3.5, 1, 0.05)).toEqual({
      x: 2.45,
      z: -0.05,
    });
    expect(clampIntoHalf(h, 'guest', -9, -3, 0.05)).toEqual({
      x: -2.45,
      z: -4.05,
    });
  });
});

describe('nudgeClear', () => {
  it('leaves a clear point alone', () => {
    expect(nudgeClear({ x: 0, z: -2 }, [{ x: 1, z: -2 }], 0.12, h)).toEqual({
      x: 0,
      z: -2,
    });
  });
  it('moves a coincident point at least minSeparation away', () => {
    const p = nudgeClear({ x: 0, z: -2 }, [{ x: 0, z: -2 }], 0.12, h);
    expect(Math.hypot(p.x, p.z + 2)).toBeGreaterThanOrEqual(0.12 - 1e-9);
  });
  it('stays inside the sidelines', () => {
    const p = nudgeClear({ x: 2.45, z: -2 }, [{ x: 2.4, z: -2 }], 0.12, h);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(2.5);
  });
});

describe('inkastRackPosition (on the kubb table)', () => {
  const rack = {
    tableXM: 1,
    tableZM: 1,
    topM: 0.8,
    columns: 5,
    columnSpacingM: 0.2,
    rowSpacingM: 0.17,
    kubbHeightM: 0.15,
  };
  it('stands up to five in one row centred on the table top', () => {
    expect(inkastRackPosition(h, 'host', 0, 1, rack)).toEqual([1, 0.875, 1]);
    expect(inkastRackPosition(h, 'host', 0, 3, rack)[0]).toBeCloseTo(0.8);
    expect(inkastRackPosition(h, 'host', 2, 3, rack)[0]).toBeCloseTo(1.2);
  });

  it('uses two rows beyond five', () => {
    const a = inkastRackPosition(h, 'host', 0, 7, rack);
    const b = inkastRackPosition(h, 'host', 5, 7, rack);
    expect(a[2]).toBeCloseTo(1 - 0.085);
    expect(b[2]).toBeCloseTo(1 + 0.085);
    expect(b[0]).toBeCloseTo(0.9); // two in the back row, centred
  });

  it('mirrors onto the far table for the guest', () => {
    expect(inkastRackPosition(h, 'guest', 0, 1, rack)).toEqual([-1, 0.875, -9]);
  });
});

describe('retiredKubbPosition (simplified rules: out of play)', () => {
  const layout = { sideOffsetM: 1, spacingM: 0.35, lyingHeightM: 0.035 };

  it('lies beside the side line, the first one level with the centre', () => {
    expect(retiredKubbPosition(h, 0, layout)).toEqual([3.5, 0.035, -4]);
  });

  it('alternates outwards along z so the row stays centred', () => {
    const zs = [1, 2, 3, 4].map((i) => retiredKubbPosition(h, i, layout)[2]);
    expect(zs).toEqual([-3.65, -4.35, -3.3, -4.7]);
    const xs = [1, 2, 3, 4].map((i) => retiredKubbPosition(h, i, layout)[0]);
    expect(new Set(xs)).toEqual(new Set([3.5]));
  });

  it('every slot of a full match is distinct and off the court', () => {
    const slots = Array.from({ length: 10 }, (_, i) =>
      retiredKubbPosition(h, i, layout),
    );
    expect(new Set(slots.map((p) => p[2])).size).toBe(10);
    for (const [x] of slots) expect(x).toBeGreaterThan(h.halfWidthM);
  });

  it('lies on its side: a quarter turn about z', () => {
    const [x, y, z, w] = RETIRED_KUBB_QUATERNION;
    expect([x, y]).toEqual([0, 0]);
    expect(z).toBeCloseTo(Math.SQRT1_2);
    expect(w).toBeCloseTo(Math.SQRT1_2);
  });
});
