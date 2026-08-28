import {
  createSystem,
  GrabSystem,
  Grabbed,
  InputComponent,
  Vector3,
} from '@iwsdk/core';
import { StickState } from '../components/stick-state.js';
import { log } from '../core/log.js';
import type { Hand } from './hapticPlayer.js';

const HANDOFF_RANGE_M = 0.15;

/**
 * Lets the free hand "take over" a held stick — OneHandGrabbable's
 * underlying pointer capture (`multitouch: false`, @pmndrs/handle)
 * otherwise ignores a second hand's squeeze outright while the first
 * still holds it (verified in source: `capturePointer` returns false
 * without even queuing the second pointer). Erik's feedback
 * (2026-08-28): wants a real handoff, not a two-handed hold — see
 * docs/DECISIONS.md for why TwoHandsGrabbable's multitouch:true isn't
 * the right fix (both hands would grip at once, and ThrowingSystem's
 * single-hand release math has no notion of that).
 *
 * The actual physical-squeeze grab capture is wired outside the ECS
 * update loop (verified live, not assumed — see docs/DECISIONS.md):
 * releasing the holding hand here does NOT let that same squeeze
 * press grab it, because that press's own capture attempt already ran
 * and failed before this system's next tick. The real, tested
 * behavior is two presses: squeeze near an already-held stick to make
 * the holder let go, then squeeze again to pick it up — not a single
 * seamless motion. Still a real fix for Erik's complaint (today,
 * without this system, the second hand can't take over AT ALL), just
 * not literally as smooth as "pass it between hands."
 */
export class HandoffSystem extends createSystem({
  heldSticks: { required: [StickState, Grabbed] },
}) {
  private grabSystem!: GrabSystem;
  private tmpHandPos = new Vector3();
  private tmpStickPos = new Vector3();

  init(): void {
    const grabSystem = this.world.getSystem(GrabSystem);
    if (!grabSystem) {
      throw new Error(
        'HandoffSystem requires GrabSystem — enable the "grabbing" world feature in iwsdk.config.json',
      );
    }
    this.grabSystem = grabSystem;
  }

  update(): void {
    for (const entity of this.queries.heldSticks.entities) {
      const holdingHand = this.grabSystem.getHolderHand(entity);
      if (holdingHand === null) {
        continue;
      }
      const freeHand: Hand = holdingHand === 'left' ? 'right' : 'left';
      const freeGamepad = this.input.xr.gamepads[freeHand];
      if (!freeGamepad?.getButtonDown(InputComponent.Squeeze)) {
        continue;
      }
      const object3D = entity.object3D;
      if (!object3D) {
        continue;
      }
      const gripSpace =
        freeHand === 'left'
          ? this.player.gripSpaces.left
          : this.player.gripSpaces.right;
      gripSpace.getWorldPosition(this.tmpHandPos);
      object3D.getWorldPosition(this.tmpStickPos);
      if (this.tmpHandPos.distanceTo(this.tmpStickPos) > HANDOFF_RANGE_M) {
        continue;
      }
      this.grabSystem.forceRelease(entity);
      log('debug', 'grab', 'handoff released', {
        entityIndex: entity.index,
        from: holdingHand,
        to: freeHand,
      });
    }
  }
}
