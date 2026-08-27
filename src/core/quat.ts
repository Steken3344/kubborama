import type { Vec3 } from './vec3.js';

/** [x, y, z, w] — matches the IWSDK/three.js convention. */
export type Quat = [x: number, y: number, z: number, w: number];

export function fromAxisAngle(axis: Vec3, angleRad: number): Quat {
  const half = angleRad / 2;
  const s = Math.sin(half);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)];
}

function multiply(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

function conjugate(q: Quat): Quat {
  return [-q[0], -q[1], -q[2], q[3]];
}

/**
 * Angular velocity (rad/s) of the rotation from `a` to `b` over `dtS`
 * seconds — the math behind release spin: sample the hand's orientation
 * each frame, diff consecutive samples with this. Standard "relative
 * rotation → axis-angle → divide by dt" derivation; handles the
 * quaternion double-cover (q and -q represent the same rotation) by
 * always taking the shortest path.
 */
export function angularVelocityBetween(a: Quat, b: Quat, dtS: number): Vec3 {
  if (dtS <= 0) {
    return [0, 0, 0];
  }
  let delta = multiply(b, conjugate(a));
  if (delta[3] < 0) {
    delta = [-delta[0], -delta[1], -delta[2], -delta[3]];
  }
  const w = Math.min(1, Math.max(-1, delta[3]));
  const angleRad = 2 * Math.acos(w);
  const sinHalfAngle = Math.sqrt(1 - w * w);
  if (sinHalfAngle < 1e-9) {
    return [0, 0, 0];
  }
  const [x, y, z] = delta;
  return [
    (x / sinHalfAngle) * (angleRad / dtS),
    (y / sinHalfAngle) * (angleRad / dtS),
    (z / sinHalfAngle) * (angleRad / dtS),
  ];
}
