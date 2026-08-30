import { createSystem, InputComponent } from '@iwsdk/core';

/** Hoisted out of update() — `['left', 'right'] as const` inside the
 * loop allocated a fresh array every single frame (M5 adversarial
 * review gate, docs/DECISIONS.md). */
const HANDS = ['left', 'right'] as const;

/**
 * Lets the trigger ALSO grab a nearby stick, not just squeeze (Erik's
 * feedback, 2026-08-29). Routes trigger down/up as a squeeze event on
 * the grab pointer — the exact same public mechanism `GrabSystem`'s
 * own `useHandPinchForGrab` option uses internally to forward hand-
 * pinch gestures to grab (`multiPointers[hand].routeDown('squeeze',
 * 'grab', ...)`, see docs/DECISIONS.md) — never touches `Handle` or
 * any other private state, so `Grabbed`/`ThrowingSystem`/
 * `ImpactSystem` all see a real grab exactly as if squeeze had done
 * it. If nothing is within the grab pointer's own ~7cm proximity at
 * that instant this is a no-op, exactly like squeezing empty air
 * already is — so it never conflicts with `StickPullSystem`'s
 * separate ray+trigger pull-from-distance use of the same button:
 * far away, this fires and finds nothing; once close enough to grab,
 * `Grabbed` excludes the entity from `StickPullSystem`'s query anyway.
 */
export class TriggerGrabSystem extends createSystem({}) {
  update(_delta: number, time: number): void {
    const timeStamp = time * 1000;
    for (const hand of HANDS) {
      const gamepad = this.input.xr.gamepads[hand];
      if (!gamepad) {
        continue;
      }
      const multiPointer = this.input.xr.multiPointers[hand];
      if (gamepad.getButtonDown(InputComponent.Trigger)) {
        multiPointer.routeDown('squeeze', 'grab', { timeStamp });
      }
      if (gamepad.getButtonUp(InputComponent.Trigger)) {
        multiPointer.routeUp('squeeze', 'grab', { timeStamp });
      }
    }
  }
}
