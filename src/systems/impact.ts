import {
  createSystem,
  eq,
  PhysicsBody,
  PhysicsState,
  Vector3,
} from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import { pieces } from '../config.js';
import { gameEvents } from '../core/events.js';
import { impactRumble, scaleHapticPulse } from '../core/haptics.js';
import { detectImpact } from '../core/impactDetector.js';
import { log } from '../core/log.js';
import type { Vec3 } from '../core/vec3.js';
import { settingsState } from '../settingsState.js';

/**
 * No public collision-event API exists (see docs/DECISIONS.md): this
 * is the |delta v|-per-tick heuristic applied to every dynamic body.
 * Emits Impact for M3's future topple logic to consume, and fires
 * impactRumble haptics on a flying stick's last-thrower hand.
 */
export class ImpactSystem extends createSystem({
  dynamicBodies: {
    required: [PhysicsBody],
    where: [eq(PhysicsBody, 'state', PhysicsState.Dynamic)],
  },
}) {
  // One persisted Vec3 per entity (allocated once, on first sighting),
  // mutated in place every frame after that — see docs/DECISIONS.md,
  // fresh-eyes M2 review nitpick about per-frame allocation here.
  private previousVelocity = new Map<number, Vec3>();
  private tmpCurr: Vec3 = [0, 0, 0];
  private tmpPos = new Vector3();

  update(_delta: number, time: number): void {
    for (const entity of this.queries.dynamicBodies.entities) {
      const linVel = entity.getVectorView(PhysicsBody, '_linearVelocity');
      this.tmpCurr[0] = linVel[0] ?? 0;
      this.tmpCurr[1] = linVel[1] ?? 0;
      this.tmpCurr[2] = linVel[2] ?? 0;

      let prev = this.previousVelocity.get(entity.index);
      if (prev === undefined) {
        prev = [this.tmpCurr[0], this.tmpCurr[1], this.tmpCurr[2]];
        this.previousVelocity.set(entity.index, prev);
      }
      const { isImpact, deltaVMps } = detectImpact(
        prev,
        this.tmpCurr,
        pieces.throw.impactThresholdMps,
      );
      prev[0] = this.tmpCurr[0];
      prev[1] = this.tmpCurr[1];
      prev[2] = this.tmpCurr[2];

      if (!isImpact) {
        continue;
      }

      let position: Vec3 = [0, 0, 0];
      const object3D = entity.object3D;
      if (object3D) {
        object3D.getWorldPosition(this.tmpPos);
        position = [this.tmpPos.x, this.tmpPos.y, this.tmpPos.z];
      }

      gameEvents.emit('Impact', {
        entityId: String(entity.index),
        forceMagnitude: deltaVMps,
        position,
        timeS: time,
      });
      log('debug', 'physics', 'impact', {
        entityIndex: entity.index,
        deltaVMps,
      });

      this.pulseIfFlyingStick(entity, deltaVMps);
    }
  }

  private pulseIfFlyingStick(entity: Entity, deltaVMps: number): void {
    if (!entity.hasComponent(StickState)) {
      return;
    }
    if (entity.getValue(StickState, 'phase') !== StickPhase.Flying) {
      return;
    }
    const hand = entity.getValue(StickState, 'lastThrowerHand');
    if (!isHand(hand)) {
      return;
    }
    const rawPulse = impactRumble(
      deltaVMps,
      pieces.throw.impactMaxForceForFullHapticMps,
    );
    const pulse = scaleHapticPulse(
      rawPulse,
      settingsState.current.hapticsEnabled,
      settingsState.current.hapticsIntensityPercent,
    );
    if (!pulse) {
      return;
    }
    const gamepad = this.input.xr.gamepads[hand];
    gamepad?.inputSource.gamepad?.hapticActuators?.[0]?.pulse(
      pulse.intensity,
      pulse.durationMs,
    );
  }
}

function isHand(value: string | null): value is 'left' | 'right' {
  return value === 'left' || value === 'right';
}
