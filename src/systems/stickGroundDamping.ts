import { createSystem, eq, PhysicsBody, Vector3 } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { pieces } from '../config.js';
import { activePreset, percentToReal, tuningParams } from '../core/tuning.js';
import { presetBank } from '../tuningState.js';
import { readBodySpeed } from './bodySpeed.js';

/**
 * Erik's feedback (2026-08-28), addressed two different ways: raising
 * `angularDampingInFlight` to fight ground-rolling also made throws
 * feel "sluggish" — that single value governs a stick's rotation for
 * its ENTIRE lifetime (TuningLabSystem sets it once, and nothing marks
 * a stick "landed" separately from merely "at rest" — see
 * docs/DECISIONS.md). Reverted that value back to its felt-correct
 * M1/M2 default and put the ground-rolling fix here instead: every
 * frame, a Flying stick close to the ground with modest linear AND
 * angular speed (landed, possibly still rolling/sliding) gets a much
 * higher angularDamping than one still genuinely airborne — so
 * in-flight spin is untouched and only the post-landing roll is
 * shortened.
 *
 * Checks the FULL speed (readBodySpeed, shared with
 * ThrowingSystem/ToppleSystem's own rest checks — see
 * core/restState.ts) rather than vertical velocity alone: a fresh-eyes
 * review caught that a vertical-only check reads "grounded" at the low
 * point of any flat, fast throw the instant vertical velocity crosses
 * zero, even while the stick is still moving several m/s horizontally
 * and spinning — reintroducing the exact damped/sluggish feel this
 * system exists to avoid, just for flatter throws specifically.
 * Deliberately looser than core/restState.ts's `isResting` thresholds
 * (which mean "basically stopped," used to decide Settled) — this
 * needs to catch a stick that's landed but still visibly rolling, not
 * one that's already nearly at rest.
 */
export class StickGroundDampingSystem extends createSystem({
  flyingSticks: {
    required: [StickState, PhysicsBody],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  private tmpPos = new Vector3();
  private tmpSpeed: [number, number] = [0, 0];

  update(): void {
    const flightDamping = percentToReal(
      tuningParams.angularDampingInFlight,
      activePreset(presetBank).angularDampingInFlight,
    );
    for (const entity of this.queries.flyingSticks.entities) {
      const object3D = entity.object3D;
      let heightM = Infinity;
      if (object3D) {
        object3D.getWorldPosition(this.tmpPos);
        heightM = this.tmpPos.y;
      }
      readBodySpeed(entity, this.tmpSpeed);
      const [linSpeedMps, angSpeedRadS] = this.tmpSpeed;
      const grounded =
        heightM < pieces.throw.groundHeightM &&
        linSpeedMps < pieces.throw.groundLinearSpeedMps &&
        angSpeedRadS < pieces.throw.groundAngularSpeedRadS;
      entity.setValue(
        PhysicsBody,
        'angularDamping',
        grounded ? pieces.throw.groundAngularDamping : flightDamping,
      );
    }
  }
}
