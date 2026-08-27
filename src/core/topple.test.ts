import { describe, expect, it } from 'vitest';
import { fromAxisAngle } from './quat.js';
import { isToppled, tiltAngleDeg } from './topple.js';

describe('tiltAngleDeg', () => {
  it('is 0 for an upright (identity) orientation', () => {
    expect(tiltAngleDeg([0, 0, 0, 1])).toBeCloseTo(0);
  });

  it('is 90 for a piece rotated 90 degrees onto its side', () => {
    const q = fromAxisAngle([1, 0, 0], Math.PI / 2);
    expect(tiltAngleDeg(q)).toBeCloseTo(90);
  });

  it('is 180 for a piece rotated fully upside down', () => {
    const q = fromAxisAngle([1, 0, 0], Math.PI);
    expect(tiltAngleDeg(q)).toBeCloseTo(180);
  });

  it('is unaffected by yaw (rotation about the up axis itself)', () => {
    const q = fromAxisAngle([0, 1, 0], Math.PI / 3);
    expect(tiltAngleDeg(q)).toBeCloseTo(0);
  });

  it('reports the same tilt regardless of yaw combined with a tilt', () => {
    const tiltOnly = fromAxisAngle([1, 0, 0], (40 * Math.PI) / 180);
    const yawed = fromAxisAngle([0, 1, 0], 1.1);
    // Compose yaw then tilt (order matters for the resulting axis, not
    // for how far off vertical the local up ends up).
    const [ax, ay, az, aw] = tiltOnly;
    const [bx, by, bz, bw] = yawed;
    const composed: [number, number, number, number] = [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
    expect(tiltAngleDeg(composed)).toBeCloseTo(40, 0);
  });
});

describe('isToppled', () => {
  it('is false for an upright piece against a 60 degree threshold', () => {
    expect(isToppled([0, 0, 0, 1], 60)).toBe(false);
  });

  it('is false for a wobble under the threshold', () => {
    const q = fromAxisAngle([1, 0, 0], (30 * Math.PI) / 180);
    expect(isToppled(q, 60)).toBe(false);
  });

  it('is true once tilt exceeds the threshold', () => {
    const q = fromAxisAngle([1, 0, 0], (75 * Math.PI) / 180);
    expect(isToppled(q, 60)).toBe(true);
  });

  it('treats the exact threshold as not-yet-toppled', () => {
    const q = fromAxisAngle([1, 0, 0], (60 * Math.PI) / 180);
    expect(isToppled(q, 60)).toBe(false);
  });
});
