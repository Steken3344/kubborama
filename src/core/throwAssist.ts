import { multiply, rotateVectorByQuaternion, slerpInto } from './quat.js';
import type { Quat } from './quat.js';
import { cross, dot, length, normalize, scale, sub } from './vec3.js';
import type { Vec3 } from './vec3.js';

/**
 * The SWING decides the throw, not the wrist (Erik, 2026-11-01: "jag
 * kastar lika men det är väldigt stor skillnad … ofta lite
 * helikopterspinn fast jag inte vill … känns som vinkeln på handen är
 * avgörande men det borde vara svingen"). The release spin used to be
 * the controller's whole angular velocity, so a small wrist twist or
 * yaw at release turned an underhand swing into a helicopter (spin
 * about the vertical — not even allowed by the kubb rules), and the
 * stick left pointing wherever the hand was angled.
 *
 * At release:
 * - spin: only the part about the throw's LATERAL axis (horizontal,
 *   across the throwing direction) is kept — the swing's own
 *   end-over-end rotation; `spinAssist` (0…1) of the rest is removed;
 * - orientation: the stick is turned the shortest way into the vertical
 *   plane of the throw (it keeps its tilt, loses its sideways yaw), by
 *   `alignAssist` (0…1).
 * The throwing direction is the release velocity's horizontal part, or
 * the stick's own when the release is nearly straight up.
 */
export interface ThrowAssistOptions {
  spinAssist: number;
  alignAssist: number;
}

export interface AssistedRelease {
  angularVelocity: Vec3;
  quaternion: Quat;
}

const UP: Vec3 = [0, 1, 0];
const MIN_HORIZONTAL_MPS = 0.3;

/** The shortest rotation taking unit `a` onto unit `b`. */
function rotationBetween(a: Vec3, b: Vec3): Quat {
  const [cx, cy, cz] = cross(a, b);
  const w = 1 + dot(a, b);
  if (w < 1e-6) {
    return [1, 0, 0, 0]; // opposite (not reached: the stick is symmetric)
  }
  const n = Math.hypot(cx, cy, cz, w);
  return [cx / n, cy / n, cz / n, w / n];
}

export function assistRelease(
  linearVelocity: Vec3,
  angularVelocity: Vec3,
  quaternion: Quat,
  opts: ThrowAssistOptions,
): AssistedRelease {
  const axis = rotateVectorByQuaternion(UP, quaternion);
  const horizontal: Vec3 = [linearVelocity[0], 0, linearVelocity[2]];
  const forward: Vec3 =
    length(horizontal) >= MIN_HORIZONTAL_MPS
      ? normalize(horizontal)
      : normalize([axis[0], 0, axis[2]]);
  if (length(forward) < 0.5) {
    return { angularVelocity, quaternion }; // no direction to judge by
  }
  const lateral = normalize(cross(UP, forward));
  // Spin: the swing's end-over-end part stays, the rest fades out.
  const swing = scale(lateral, dot(angularVelocity, lateral));
  const rest = sub(angularVelocity, swing);
  const spin: Vec3 = [
    swing[0] + rest[0] * (1 - opts.spinAssist),
    swing[1] + rest[1] * (1 - opts.spinAssist),
    swing[2] + rest[2] * (1 - opts.spinAssist),
  ];
  // Orientation: the long axis into the throw's vertical plane. The
  // stick is the same at both ends, so whichever way it points is kept.
  const inPlane = sub(axis, scale(lateral, dot(axis, lateral)));
  const target = length(inPlane) > 0.2 ? normalize(inPlane) : forward;
  const aligned = multiply(rotationBetween(axis, target), quaternion);
  const out: Quat = [0, 0, 0, 1];
  slerpInto(quaternion, aligned, opts.alignAssist, out);
  return { angularVelocity: spin, quaternion: out };
}
