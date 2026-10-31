import { createSystem, LocomotionEnvironment, Vector3 } from '@iwsdk/core';
import { walkArea } from '../config.js';
import { clampToWalkArea } from '../core/walkArea.js';
import { movePlayerTo } from '../playerPlacement.js';

/**
 * Thumbstick locomotion (Erik, 2026-10-31; iwsdk.config.json
 * `features.locomotion`): the ground becomes walkable, and the player
 * is kept inside the garden (core/walkArea.ts). Registered after
 * IWSDK's LocomotionSystem, so it corrects the frame's slide before
 * anything reads the rig.
 */
export class WalkAreaSystem extends createSystem({}) {
  private point = { x: 0, z: 0 };
  private target = new Vector3();

  init(): void {
    // The walkable surface is set here rather than in the scene JSON, so
    // the editor and the game server's scene reader stay untouched.
    this.world
      .requireSceneEntity('ground')
      .addComponent(LocomotionEnvironment, { type: 'static' });
  }

  update(): void {
    this.point.x = this.player.position.x;
    this.point.z = this.player.position.z;
    if (clampToWalkArea(this.point, walkArea)) {
      this.target.set(this.point.x, this.player.position.y, this.point.z);
      movePlayerTo(this.world, this.player, this.target);
    }
  }
}
