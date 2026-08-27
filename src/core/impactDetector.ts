import { length, sub } from './vec3.js';
import type { Vec3 } from './vec3.js';

export interface ImpactResult {
  isImpact: boolean;
  deltaVMps: number;
}

/**
 * No public collision-event API exists (see docs/DECISIONS.md) — this
 * is impact detection instead: track each piece's velocity per tick,
 * and a |delta v| jump above `thresholdMps` counts as an impact, with
 * the magnitude scaling haptics/sound. Stateless and pure; the caller
 * (a system) owns remembering the previous-tick velocity per entity.
 */
export function detectImpact(
  previousVelocity: Vec3,
  currentVelocity: Vec3,
  thresholdMps: number,
): ImpactResult {
  const deltaVMps = length(sub(currentVelocity, previousVelocity));
  return { isImpact: deltaVMps >= thresholdMps, deltaVMps };
}
