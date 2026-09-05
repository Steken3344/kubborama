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

/* ---- MP3b avatar-body helpers (2026-09-05) ------------------------------
 * Closed-form, no three.js — src/core stays pure. Only what the avatar
 * solver (core/avatarPose.ts) needs; still not a general math library. */

/** v' = q v q* — the standard expansion. */
export function rotateVectorByQuaternion(v: Vec3, q: Quat): Vec3 {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  // v' = v + qw * t + cross(q.xyz, t)
  return [
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx),
  ];
}

/** Rotation about +Y. Yaw 0 faces -Z (the player's default facing);
 * positive yaw turns left (counter-clockwise seen from above). */
export function quaternionFromYaw(yawRad: number): Quat {
  return [0, Math.sin(yawRad / 2), 0, Math.cos(yawRad / 2)];
}

/** The yaw of a rotation's forward (-Z) vector, pitch/roll ignored. */
export function yawFromQuaternion(q: Quat): number {
  const [fx, , fz] = rotateVectorByQuaternion([0, 0, -1], q);
  return Math.atan2(-fx, -fz);
}

/**
 * The rotation taking +Y onto `dir` (normalised defensively). Used to
 * lay a unit-length capsule along a limb. +Y → identity; -Y → 180° about
 * +X (any axis perpendicular to Y works; X is the conventional pick).
 */
export function quaternionAligningY(dir: Vec3): Quat {
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  if (len === 0) {
    return [0, 0, 0, 1];
  }
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const dz = dir[2] / len;
  // dot(+Y, d) = dy; cross(+Y, d) = (dz, 0, -dx).
  if (dy > 1 - 1e-9) {
    return [0, 0, 0, 1];
  }
  if (dy < -1 + 1e-9) {
    return [1, 0, 0, 0];
  }
  // Half-angle form: q = [cross, 1 + dot] normalised.
  const cx = dz;
  const cz = -dx;
  const w = 1 + dy;
  const n = Math.hypot(cx, cz, w);
  return [cx / n, 0, cz / n, w / n];
}
