import { angularVelocityBetween } from './quat.js';
import type { Quat } from './quat.js';
import { add, cross, scale } from './vec3.js';
import type { Vec3 } from './vec3.js';

export interface PoseSample {
  timeS: number;
  position: Vec3;
  orientation: Quat;
}

export interface HandVelocity {
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

export interface ReleaseVelocity {
  linearVelocity: Vec3;
  angularVelocity: Vec3;
}

const ZERO: Vec3 = [0, 0, 0];

/**
 * Frame-averaged hand velocity from a short window of pose samples
 * (oldest to newest). Recency-weighted — each consecutive-pair estimate
 * is weighted by its position in the window (1, 2, 3, ...), so the most
 * recent segment dominates. Keeps the window SHORT (~3-5 samples) at
 * the call site: enough to kill sensor noise, not so much that release
 * timing feels laggy.
 */
export function computeHandVelocity(samples: PoseSample[]): HandVelocity {
  if (samples.length < 2) {
    return { linearVelocity: ZERO, angularVelocity: ZERO };
  }

  let linearSum: Vec3 = [0, 0, 0];
  let angularSum: Vec3 = [0, 0, 0];
  let weightSum = 0;

  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1];
    const curr = samples[i];
    if (prev === undefined || curr === undefined) {
      throw new Error('unreachable: index within bounds');
    }
    const dtS = curr.timeS - prev.timeS;
    if (dtS <= 0) {
      continue;
    }
    const weight = i; // recency-weighted: later pairs count more
    const segmentLinear = scale(
      [
        curr.position[0] - prev.position[0],
        curr.position[1] - prev.position[1],
        curr.position[2] - prev.position[2],
      ],
      1 / dtS,
    );
    const segmentAngular = angularVelocityBetween(
      prev.orientation,
      curr.orientation,
      dtS,
    );
    linearSum = add(linearSum, scale(segmentLinear, weight));
    angularSum = add(angularSum, scale(segmentAngular, weight));
    weightSum += weight;
  }

  if (weightSum === 0) {
    return { linearVelocity: ZERO, angularVelocity: ZERO };
  }
  return {
    linearVelocity: scale(linearSum, 1 / weightSum),
    angularVelocity: scale(angularSum, 1 / weightSum),
  };
}

/**
 * The lever-arm correction — the heart of honest throw feel. The hand
 * grips the stick at one END, so the stick's center of mass is offset
 * from the hand by `leverArm` (p_com - p_hand). A rotating rigid body's
 * point velocity is v_point = v_reference + ω × (p_point - p_reference),
 * so:
 *
 *   v_com = v_hand + ω_hand × (p_com - p_hand)
 *
 * Copying raw hand velocity straight to the CoM (ignoring this term) is
 * the classic VR throwing bug — every throw feels subtly wrong,
 * especially under spin. angularVelocity passes through unchanged: the
 * stick's release spin IS the hand's spin (rigid grip, no slip).
 */
export function computeReleaseVelocity(
  handVelocity: HandVelocity,
  leverArm: Vec3,
): ReleaseVelocity {
  return {
    linearVelocity: add(
      handVelocity.linearVelocity,
      cross(handVelocity.angularVelocity, leverArm),
    ),
    angularVelocity: handVelocity.angularVelocity,
  };
}
