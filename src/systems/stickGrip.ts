import {
  createSystem,
  GrabSystem,
  Grabbed,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { StickState } from '../components/stick-state.js';
import { pieces, stickGrip } from '../config.js';
import { stickInHand } from '../core/stickGrip.js';
import type { Quat } from '../core/quat.js';
import type { Vec3 } from '../core/vec3.js';

/**
 * Lays a held stick into the hand by its end (core/stickGrip.ts — Erik
 * chose "änden i handen", 2026-11-01), every frame between GrabSystem
 * (priority −3, which would keep the grab-time offset) and PhysicsSystem
 * (−2, which drives a Grabbed body toward the object's pose with
 * SetTargetQTransform). Registered at −2.5 in src/index.ts. The throw
 * itself is unchanged: ThrowingSystem samples the grip, and its release
 * position is this pose. Allocates nothing per frame.
 */
export class StickGripSystem extends createSystem({
  held: { required: [StickState, Grabbed] },
}) {
  private grabSystem!: GrabSystem;
  private readonly tmpPos = new Vector3();
  private readonly tmpQuat = new Quaternion();
  private readonly gripPosition: Vec3 = [0, 0, 0];
  private readonly gripQuaternion: Quat = [0, 0, 0, 1];
  private readonly pose = {
    position: [0, 0, 0] as Vec3,
    quaternion: [0, 0, 0, 1] as Quat,
  };
  private readonly opts = {
    lengthM: pieces.stick.lengthM,
    holdFromEndM: stickGrip.holdFromEndM,
    pitchDownDeg: stickGrip.pitchDownDeg,
  };

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    if (!grabSystem) {
      throw new Error('StickGripSystem requires GrabSystem');
    }
    this.grabSystem = grabSystem;
  }

  update(): void {
    for (const entity of this.queries.held.entities) {
      const object3D = entity.object3D;
      const hand = this.grabSystem.getHolderHand(entity);
      if (!object3D || (hand !== 'left' && hand !== 'right')) {
        continue;
      }
      const grip =
        hand === 'left'
          ? this.player.gripSpaces.left
          : this.player.gripSpaces.right;
      grip.getWorldPosition(this.tmpPos);
      grip.getWorldQuaternion(this.tmpQuat);
      this.gripPosition[0] = this.tmpPos.x;
      this.gripPosition[1] = this.tmpPos.y;
      this.gripPosition[2] = this.tmpPos.z;
      this.gripQuaternion[0] = this.tmpQuat.x;
      this.gripQuaternion[1] = this.tmpQuat.y;
      this.gripQuaternion[2] = this.tmpQuat.z;
      this.gripQuaternion[3] = this.tmpQuat.w;
      stickInHand(this.gripPosition, this.gripQuaternion, this.opts, this.pose);
      // Scene-level pieces: local = world (as PhysicsSystem also assumes).
      const [px, py, pz] = this.pose.position;
      const [qx, qy, qz, qw] = this.pose.quaternion;
      object3D.position.set(px, py, pz);
      object3D.quaternion.set(qx, qy, qz, qw);
    }
  }
}
