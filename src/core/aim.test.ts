import { describe, expect, it } from 'vitest';
import { aimRelease, flightTimeFor, GRAVITY_MPS2 } from './aim.js';
import type { Vec3 } from './vec3.js';

/** Where a point mass released at `from` with `v` is after `t` s. */
const fly = (from: Vec3, v: Vec3, t: number): Vec3 => [
  from[0] + v[0] * t,
  from[1] + v[1] * t - 0.5 * GRAVITY_MPS2 * t * t,
  from[2] + v[2] * t,
];

describe('aimRelease', () => {
  for (const [from, target] of [
    [
      [0.2, 1, -0.3],
      [0.5, 0.15, -8],
    ],
    [
      [-0.1, 1.1, -7.7],
      [0, 0.15, 0],
    ],
    [
      [0, 1, -0.3],
      [-2, 0.15, -6],
    ],
  ] as Array<[Vec3, Vec3]>) {
    it(`lands on ${target.join(',')} from ${from.join(',')}`, () => {
      const t = 1.1;
      const landed = fly(from, aimRelease(from, target, t), t);
      for (let i = 0; i < 3; i += 1) {
        expect(Math.abs((landed[i] ?? 0) - (target[i] ?? 0))).toBeLessThan(
          1e-9,
        );
      }
    });
  }

  it('takes longer for a longer throw at the same speed', () => {
    const near = flightTimeFor([0, 1, 0], [0, 0.15, -4], 7);
    const far = flightTimeFor([0, 1, 0], [0, 0.15, -8], 7);
    expect(far).toBeGreaterThan(near);
    expect(near).toBeGreaterThan(0.3);
    expect(far).toBeLessThan(2);
  });
});
