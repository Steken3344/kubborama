import type { Object3D } from '@iwsdk/core';
import type { Pose } from '../core/presence.js';

/** An Object3D's LOCAL transform as the plain `Pose` the pure core
 * speaks (presence, pieceSync, mirrorPoseToFarBaseline). Every scene
 * piece this project moves is a root-level entity, so local == world;
 * callers that need a true world pose for a nested object must use
 * getWorldPosition/getWorldQuaternion instead. Allocates — never call
 * from update(). */
export function localPoseOf(object3D: Object3D): Pose {
  return {
    position: [object3D.position.x, object3D.position.y, object3D.position.z],
    quaternion: [
      object3D.quaternion.x,
      object3D.quaternion.y,
      object3D.quaternion.z,
      object3D.quaternion.w,
    ],
  };
}
