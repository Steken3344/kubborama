import { createSystem, eq, PhysicsBody, Vector3 } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { pieces } from '../config.js';
import { isStickOnGround } from '../core/groundDamping.js';
import { activePreset, percentToReal, tuningParams } from '../core/tuning.js';
import { presetBank } from '../tuningState.js';

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
 * 2026-11-01 (Erik: "pinnarna rullar … borde inte rulla så långt"):
 * "landed" is now height alone (core/groundDamping.ts) — the old speed
 * gates never let a ROLLING stick count as landed — and a landed stick
 * gets grass drag on its linear damping too, restored once airborne.
 * The server's MatchHost applies the same rule to its own bodies.
 */
export class StickGroundDampingSystem extends createSystem({
  flyingSticks: {
    required: [StickState, PhysicsBody],
    where: [eq(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  private tmpPos = new Vector3();
  /** Each stick's authored linear damping, restored once airborne. */
  private flightLinear = new Map<number, number>();

  init(): void {
    this.queries.flyingSticks.subscribe('qualify', (entity) => {
      if (!this.flightLinear.has(entity.index)) {
        this.flightLinear.set(
          entity.index,
          entity.getValue(PhysicsBody, 'linearDamping') ?? 0,
        );
      }
      // Just thrown: drop any grass brake left from its last landing
      // before the first physics step (review, 2026-11-01).
      entity.setValue(
        PhysicsBody,
        'linearDamping',
        this.flightLinear.get(entity.index) ?? 0,
      );
      entity.setValue(
        PhysicsBody,
        'angularDamping',
        percentToReal(
          tuningParams.angularDampingInFlight,
          activePreset(presetBank).angularDampingInFlight,
        ),
      );
    });
  }

  update(): void {
    const flightDamping = percentToReal(
      tuningParams.angularDampingInFlight,
      activePreset(presetBank).angularDampingInFlight,
    );
    const t = pieces.throw;
    for (const entity of this.queries.flyingSticks.entities) {
      const object3D = entity.object3D;
      let heightM = Infinity;
      if (object3D) {
        object3D.getWorldPosition(this.tmpPos);
        heightM = this.tmpPos.y;
      }
      const onGround = isStickOnGround(heightM, t);
      entity.setValue(
        PhysicsBody,
        'angularDamping',
        onGround ? t.groundAngularDamping : flightDamping,
      );
      entity.setValue(
        PhysicsBody,
        'linearDamping',
        onGround
          ? t.groundLinearDamping
          : (this.flightLinear.get(entity.index) ?? 0),
      );
    }
  }
}
