import { distance } from './vec3.js';
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
  const deltaVMps = distance(currentVelocity, previousVelocity);
  return { isImpact: deltaVMps >= thresholdMps, deltaVMps };
}

/**
 * A stick's own release is not an impact (Erik, 2026-11-01: the throw
 * felt like it "lagged" at release). Letting go jumps the body from the
 * hand's speed to the release velocity in one physics step — a Δv of
 * ~5 m/s that this heuristic read as a hit, playing an impact sound and
 * a haptic jolt the instant the stick left the hand (half the throws in
 * the logs). Impacts are ignored for `graceS` after a release; a stick
 * knocked while HELD still counts (gh#4).
 */
export function inReleaseGrace(
  releasedAtS: number | undefined,
  nowS: number,
  graceS: number,
): boolean {
  return releasedAtS !== undefined && nowS - releasedAtS < graceS;
}
