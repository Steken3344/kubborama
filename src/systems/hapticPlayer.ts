import type { StatefulGamepad } from '@iwsdk/core';
import type { HapticPulse, HapticSequence } from '../core/haptics.js';
import { scaleHapticPulse } from '../core/haptics.js';
import { settingsState } from '../settingsState.js';

export type Hand = 'left' | 'right';

export function isHand(value: string | null): value is Hand {
  return value === 'left' || value === 'right';
}

/**
 * Shared single-pulse player — every direct haptics call site (grab,
 * release, impact, UI tick) funnels through here so the settings scale
 * is applied in exactly one place. Silently no-ops when the gamepad or
 * its haptic actuator is absent (hand-tracking mode, the emulator).
 */
export function pulseHaptic(
  gamepad: StatefulGamepad | undefined,
  pattern: HapticPulse,
): void {
  const pulse = scaleHapticPulse(
    pattern,
    settingsState.current.hapticsEnabled,
    settingsState.current.hapticsIntensityPercent,
  );
  if (!pulse) {
    return;
  }
  gamepad?.inputSource.gamepad?.hapticActuators?.[0]?.pulse(
    pulse.intensity,
    pulse.durationMs,
  );
}

/**
 * Fires a HapticSequence's pulses in order with `gapMs` between each
 * pulse's start. `pulse()` is fire-and-forget (WebXR doesn't need the
 * caller to await it), so the gap is just a delay between calls — an
 * event-triggered one-shot, not a per-frame loop, so a timer here
 * doesn't conflict with the "never allocate/wait in update()" rule.
 */
export function playHapticSequence(
  gamepad: StatefulGamepad | undefined,
  sequence: HapticSequence,
): void {
  sequence.pulses.forEach((pulse, index) => {
    setTimeout(() => pulseHaptic(gamepad, pulse), index * sequence.gapMs);
  });
}
