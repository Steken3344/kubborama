import { LocomotionSystem, Vector3 } from '@iwsdk/core';
import type { Object3D, World } from '@iwsdk/core';
import type { Pose } from './core/presence.js';

const scratch = new Vector3();

/**
 * Puts the local player's rig at `pose`. With thumbstick locomotion on
 * (2026-10-31) the LocomotionSystem copies its own position onto the
 * rig every frame, so a plain `player.position.set()` would be undone
 * on the next frame — the position must go through the locomotor too.
 * The yaw stays on the rig (snap turn rotates the rig itself). Every
 * baseline / advantage-line placement goes through here.
 */
export function placePlayer(world: World, player: Object3D, pose: Pose): void {
  player.position.set(...pose.position);
  player.quaternion.set(...pose.quaternion);
  const locomotion = world.getSystem(LocomotionSystem);
  if (locomotion) {
    locomotion.setPlayerPosition(scratch.copy(player.position));
  }
}

/** Moves only the position (the walk-area clamp keeps the yaw). */
export function movePlayerTo(
  world: World,
  player: Object3D,
  position: Vector3,
): void {
  player.position.copy(position);
  world.getSystem(LocomotionSystem)?.setPlayerPosition(position);
}
