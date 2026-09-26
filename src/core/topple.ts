import type { Quat } from './quat.js';

/**
 * Angle (degrees) between a piece's local up axis, rotated into world
 * space by `quaternion`, and world up. Derived from the standard
 * quaternion-rotates-vector formula for v=(0,1,0): the resulting
 * vector's Y component simplifies to 1 - 2*(x^2 + z^2) for a unit
 * quaternion — independent of yaw (rotation about the up axis itself
 * doesn't tilt it), which is exactly the "how far off vertical" measure
 * a topple check needs.
 */
export function tiltAngleDeg(quaternion: Quat): number {
  const [x, , z] = quaternion;
  const worldUpY = 1 - 2 * (x * x + z * z);
  const clamped = Math.min(1, Math.max(-1, worldUpY));
  return (Math.acos(clamped) * 180) / Math.PI;
}

/**
 * A kubb/king counts as felled once its tilt exceeds
 * `toppleAngleDeg` (docs/PLAN.md §1: default 60) — the caller is
 * responsible for also requiring the piece to be at rest (see
 * core/restState.ts) so a merely wobbling piece never counts.
 */
export function isToppled(quaternion: Quat, toppleAngleDeg: number): boolean {
  return tiltAngleDeg(quaternion) > toppleAngleDeg;
}

/**
 * MP4 (§3.4, "leaning = felled", match only): a kubb can only come to
 * rest noticeably tilted by leaning on a stick or another kubb, and the
 * real rules count that as felled — so in a match the resting-tilt
 * threshold drops to `leaningDeg`. Solo keeps its tuned per-mode angle.
 */
export function felledAngleDeg(
  modeAngleDeg: number,
  inMatch: boolean,
  leaningDeg: number,
): number {
  return inMatch ? Math.min(modeAngleDeg, leaningDeg) : modeAngleDeg;
}

/** A felled piece standing (nearly) vertical again has been raised —
 * ToppleSystem re-arms it so it can be felled a second time. */
export function isUprightAgain(
  quaternion: Quat,
  rearmBelowDeg: number,
): boolean {
  return tiltAngleDeg(quaternion) < rearmBelowDeg;
}
