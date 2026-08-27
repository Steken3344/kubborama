import { scale } from './vec3.js';
import type { Vec3 } from './vec3.js';

/**
 * F = windVector * dragFactor (docs/PLAN.md §1) — applied every tick
 * only to sticks in the Flying state (no persistent force field;
 * PhysicsManipulation is one-shot, so the adapter re-adds it each
 * frame — see docs/DECISIONS.md's pre-M0 "design knots").
 */
export function computeWindForce(
  windVectorMps: Vec3,
  dragFactor: number,
): Vec3 {
  return scale(windVectorMps, dragFactor);
}
