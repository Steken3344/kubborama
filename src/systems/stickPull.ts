import {
  createSystem,
  Entity,
  Grabbed,
  Group,
  Hovered,
  InputComponent,
  ne,
  PhysicsManipulation,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import { StickPhase, StickState } from '../components/stick-state.js';
import type { Vec3 } from '../core/vec3.js';

const PULL_TRIGGER_THRESHOLD = 0.5;
const PULL_SPEED_MPS = 2.5;
/** Stop pulling once this close and let OneHandGrabbable's own ~7cm
 * proximity grab (verified in @pmndrs/pointer-events' createGrabPointer
 * source, see docs/DECISIONS.md) finish the job — this system never
 * completes a grab itself. */
const PULL_STOP_DISTANCE_M = 0.1;
/** How far off-axis a hand's ray may be from the stick and still count
 * as "aiming at it" — needed because Hovered carries no hand info (see
 * docs/DECISIONS.md), so a trigger held for an unrelated reason (e.g.
 * clicking a UI panel with the other hand) must not be mistaken for
 * the hand causing the hover. cos(35°) ≈ 0.82. */
const AIM_ALIGNMENT_COS = 0.82;

/**
 * Replaces DistanceGrabbable for sticks (removed from the scene, see
 * docs/DECISIONS.md, M5): DistanceGrabbable's target offset is a fixed
 * [0,0,0], so a ray-pulled stick always ends up centered on the hand —
 * and since @pmndrs/handle only lets ONE grab-type Handle exist per
 * entity, having both DistanceGrabbable and OneHandGrabbable on the
 * same stick meant EVERY grab (even a close, physical reach) went
 * through that always-centering path, not the offset-preserving one
 * (`Handle` itself isn't part of IWSDK's public API, so there's no
 * supported way to remove one Handle and let a different grab type
 * take over on the same entity once created).
 *
 * This keeps the "pull a far stick to me" convenience without
 * resurrecting that conflict: point at a stick with either hand
 * (RayInteractable + Hovered, the same signal GrabHighlightSystem
 * already uses) and hold the trigger to fly it toward that hand's grip
 * point via a direct velocity set (PhysicsManipulation), stopping once
 * it's within OneHandGrabbable's own natural grab range. From there
 * it's a normal close grab — offset-preserving, same as any other
 * stick, whether it started far away or right next to you.
 */
export class StickPullSystem extends createSystem({
  sticks: {
    required: [StickState, RayInteractable],
    excluded: [Grabbed],
    // WindSystem also drives PhysicsManipulation on Flying sticks
    // (docs/DECISIONS.md); excluding Flying here keeps the two systems
    // from fighting over the same one-shot component in the same
    // frame, and stops a stick from being tractor-beamed mid-throw.
    where: [ne(StickState, 'phase', StickPhase.Flying)],
  },
}) {
  private tmpHandPos = new Vector3();
  private tmpStickPos = new Vector3();
  private tmpDirection = new Vector3();
  private tmpRayOrigin = new Vector3();
  private tmpRayDirection = new Vector3();
  private tmpToStick = new Vector3();
  private tmpRightGripPos = new Vector3();
  private tmpLeftGripPos = new Vector3();
  /** Reused across frames/entities — elics copies `linearVelocity`
   * synchronously in addComponent, it never retains this wrapper or
   * its array (same reasoning WindSystem's MANIPULATION_OPTIONS_BY_MODE
   * relies on, see docs/DECISIONS.md, M5 GC pass). */
  private pullVelocity: { linearVelocity: Vec3 } = {
    linearVelocity: [0, 0, 0],
  };
  private stopVelocity: { linearVelocity: Vec3 } = {
    linearVelocity: [0, 0, 0],
  };
  /** Entities currently receiving pull velocity, so a lost hover/aim/
   * trigger or a reached stop-distance can be given one explicit
   * zero-velocity frame instead of coasting at the last-applied speed
   * forever (PhysicsManipulation is one-shot — see docs/DECISIONS.md). */
  private pullingEntities = new Map<number, Entity>();

  update(): void {
    const stillPulling = new Set<number>();
    for (const entity of this.queries.sticks.entities) {
      if (!entity.hasComponent(Hovered)) {
        continue;
      }
      const object3D = entity.object3D;
      if (!object3D) {
        continue;
      }
      object3D.getWorldPosition(this.tmpStickPos);
      const gripSpace = this.aimingPullerGrip(this.tmpStickPos);
      if (gripSpace === null) {
        continue;
      }
      gripSpace.getWorldPosition(this.tmpHandPos);
      this.tmpDirection.copy(this.tmpHandPos).sub(this.tmpStickPos);
      if (this.tmpDirection.length() < PULL_STOP_DISTANCE_M) {
        continue;
      }
      this.tmpDirection.normalize().multiplyScalar(PULL_SPEED_MPS);
      this.pullVelocity.linearVelocity[0] = this.tmpDirection.x;
      this.pullVelocity.linearVelocity[1] = this.tmpDirection.y;
      this.pullVelocity.linearVelocity[2] = this.tmpDirection.z;
      entity.addComponent(PhysicsManipulation, this.pullVelocity);
      stillPulling.add(entity.index);
      this.pullingEntities.set(entity.index, entity);
    }

    for (const [index, entity] of this.pullingEntities) {
      if (stillPulling.has(index)) {
        continue;
      }
      if (entity.active) {
        entity.addComponent(PhysicsManipulation, this.stopVelocity);
      }
      this.pullingEntities.delete(index);
    }
  }

  /**
   * Hovered carries no hand info (@iwsdk/core's Hovered is a plain tag
   * — see docs/DECISIONS.md), so a trigger held for an unrelated
   * reason (clicking a UI panel with the other hand, say) must not be
   * mistaken for the hand causing this stick's hover. Only a hand
   * whose ray is actually aimed roughly at the stick counts as a pull
   * candidate; if both are aimed and pulling (rays crossing), prefer
   * whichever grip is nearer.
   */
  private aimingPullerGrip(stickPos: Vector3): Group | null {
    const right = this.input.xr.gamepads.right;
    const rightPulling =
      (right?.getButtonValue(InputComponent.Trigger) ?? 0) >
      PULL_TRIGGER_THRESHOLD;
    const left = this.input.xr.gamepads.left;
    const leftPulling =
      (left?.getButtonValue(InputComponent.Trigger) ?? 0) >
      PULL_TRIGGER_THRESHOLD;
    if (!rightPulling && !leftPulling) {
      return null;
    }
    const rightAiming =
      rightPulling && this.isAimedAt(this.player.raySpaces.right, stickPos);
    const leftAiming =
      leftPulling && this.isAimedAt(this.player.raySpaces.left, stickPos);
    if (rightAiming && !leftAiming) {
      return this.player.gripSpaces.right;
    }
    if (leftAiming && !rightAiming) {
      return this.player.gripSpaces.left;
    }
    if (!rightAiming && !leftAiming) {
      return null;
    }
    this.player.gripSpaces.right.getWorldPosition(this.tmpRightGripPos);
    this.player.gripSpaces.left.getWorldPosition(this.tmpLeftGripPos);
    return stickPos.distanceToSquared(this.tmpRightGripPos) <=
      stickPos.distanceToSquared(this.tmpLeftGripPos)
      ? this.player.gripSpaces.right
      : this.player.gripSpaces.left;
  }

  private isAimedAt(raySpace: Group, targetPos: Vector3): boolean {
    raySpace.getWorldPosition(this.tmpRayOrigin);
    raySpace.getWorldDirection(this.tmpRayDirection);
    this.tmpToStick.copy(targetPos).sub(this.tmpRayOrigin).normalize();
    return this.tmpRayDirection.dot(this.tmpToStick) > AIM_ALIGNMENT_COS;
  }
}
