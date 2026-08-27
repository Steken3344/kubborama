import { PhysicsBody } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';

/** [linSpeedMps, angSpeedRadS]. Shared by ThrowingSystem (stick
 * settling) and ToppleSystem (piece-at-rest) — both needed the same
 * "how fast is this body currently moving" read. Fills `out` in place
 * (never allocates) so callers keep a persisted scratch tuple, same
 * convention as ThrowingSystem's tmpPos/tmpQuat. */
export function readBodySpeed(entity: Entity, out: [number, number]): void {
  const linVel = entity.getVectorView(PhysicsBody, '_linearVelocity');
  const angVel = entity.getVectorView(PhysicsBody, '_angularVelocity');
  out[0] = Math.hypot(linVel[0] ?? 0, linVel[1] ?? 0, linVel[2] ?? 0);
  out[1] = Math.hypot(angVel[0] ?? 0, angVel[1] ?? 0, angVel[2] ?? 0);
}
