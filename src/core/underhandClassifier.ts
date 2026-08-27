import { dot, length, normalize, cross } from './vec3.js';
import type { Vec3 } from './vec3.js';
import type { PoseSample } from './throwRelease.js';

export type ThrowStyle = 'underhand' | 'overhand' | 'helicopter';

export interface ClassifierInput {
  /** Last ~0.5s of hand poses, oldest to newest. */
  poses: PoseSample[];
  releaseVelocity: Vec3;
  angularVelocity: Vec3;
}

export interface ClassificationResult {
  style: ThrowStyle;
  /** 0-100: how well the spin axis is horizontal and perpendicular to
   * the throw direction — the real kubb "flip quality". */
  flipQualityScore: number;
}

const WORLD_UP: Vec3 = [0, 1, 0];
/** Above this |cos(angle to world-up)|, the spin axis counts as
 * "mostly vertical" — a helicopter spin, not a flip. */
const HELICOPTER_AXIS_THRESHOLD = 0.7;

/**
 * Informational only — never rejects a throw (kubb requires underhand,
 * but the POC informs rather than enforces). Inputs: the recent hand
 * pose window (to read whether the swing rose or fell) and the release
 * velocity/spin.
 */
export function classifyThrow(input: ClassifierInput): ClassificationResult {
  const spinMagnitude = length(input.angularVelocity);

  let flipQualityScore = 0;
  let isHelicopter = false;

  if (spinMagnitude > 1e-6) {
    const spinAxis = normalize(input.angularVelocity);
    const throwDirection = normalize(input.releaseVelocity);
    const idealAxis = normalize(cross(WORLD_UP, throwDirection));
    flipQualityScore = Math.round(
      Math.min(1, Math.abs(dot(spinAxis, idealAxis))) * 100,
    );
    isHelicopter =
      Math.abs(dot(spinAxis, WORLD_UP)) > HELICOPTER_AXIS_THRESHOLD;
  }

  if (isHelicopter) {
    return { style: 'helicopter', flipQualityScore };
  }

  const first = input.poses[0];
  const last = input.poses[input.poses.length - 1];
  const rose =
    first !== undefined && last !== undefined
      ? last.position[1] >= first.position[1]
      : true;

  return { style: rose ? 'underhand' : 'overhand', flipQualityScore };
}
