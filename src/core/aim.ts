import type { Vec3 } from './vec3.js';

/** The server's Havok world gravity (server/physicsWorld.ts uses this). */
export const GRAVITY_MPS2 = 9.81;

/**
 * The release velocity that carries a point from `from` to `target` in
 * `flightTimeS` under gravity (no drag): horizontal = distance / t, and
 * vertical solves y(t) = y0 + vy·t − g·t²/2 for vy. A stick is not a
 * point and it tumbles, so this aims its centre — good enough for the
 * test bot (tools/botmatch), which retries anyway.
 */
export function aimRelease(
  from: Vec3,
  target: Vec3,
  flightTimeS: number,
  gravityMps2: number = GRAVITY_MPS2,
): Vec3 {
  const t = Math.max(0.05, flightTimeS);
  return [
    (target[0] - from[0]) / t,
    (target[1] - from[1] + 0.5 * gravityMps2 * t * t) / t,
    (target[2] - from[2]) / t,
  ];
}

/** A flight time giving roughly `speedMps` along the ground. */
export function flightTimeFor(
  from: Vec3,
  target: Vec3,
  speedMps: number,
): number {
  const groundM = Math.hypot(target[0] - from[0], target[2] - from[2]);
  return Math.max(0.3, groundM / Math.max(0.1, speedMps));
}
