import { lerp, normalizedClamped } from './mathUtils.js';

/**
 * Named haptic patterns as pure data. Adapters (systems/) fire these
 * on an event — never per-frame — via the WebXR gamepad haptic
 * actuator on the correct hand, optional-chained (absent in
 * hand-tracking mode and the emulator: a silent no-op, never a crash).
 */
export interface HapticPulse {
  intensity: number; // 0-1
  durationMs: number;
}

export interface HapticSequence {
  pulses: HapticPulse[];
  /** Gap between the start of one pulse and the next. */
  gapMs: number;
}

export const grabTick: HapticPulse = { intensity: 0.3, durationMs: 15 };
export const releaseClick: HapticPulse = { intensity: 0.5, durationMs: 20 };
export const uiTick: HapticPulse = { intensity: 0.15, durationMs: 10 };

const IMPACT_MIN_INTENSITY = 0.2;
const IMPACT_MAX_INTENSITY = 1.0;
const IMPACT_MIN_DURATION_MS = 30;
const IMPACT_MAX_DURATION_MS = 80;

/**
 * Scales with the impact detector's |delta v| force magnitude. Clamps
 * outside [0, maxForceMps] so an out-of-range reading never produces
 * an out-of-range pulse.
 */
export function impactRumble(
  forceMagnitude: number,
  maxForceForFullIntensityMps: number,
): HapticPulse {
  const t = normalizedClamped(forceMagnitude, maxForceForFullIntensityMps);
  return {
    intensity: lerp(t, IMPACT_MIN_INTENSITY, IMPACT_MAX_INTENSITY),
    durationMs: lerp(t, IMPACT_MIN_DURATION_MS, IMPACT_MAX_DURATION_MS),
  };
}

/**
 * Applies the player's haptics settings (M4) at the one place every
 * pulse funnels through, rather than each call site checking the
 * setting itself. Returns null when haptics are off — the adapter
 * should skip the actuator call entirely rather than fire a
 * zero-intensity pulse.
 */
export function scaleHapticPulse(
  pulse: HapticPulse,
  hapticsEnabled: boolean,
  hapticsIntensityPercent: number,
): HapticPulse | null {
  if (!hapticsEnabled) {
    return null;
  }
  const scale = hapticsIntensityPercent / 100;
  return { intensity: pulse.intensity * scale, durationMs: pulse.durationMs };
}

// M3+ patterns — defined now (cheap, pure data) even though their
// trigger systems don't exist yet.
export const kubbFelled: HapticSequence = {
  pulses: [
    { intensity: 0.4, durationMs: 15 },
    { intensity: 0.4, durationMs: 15 },
  ],
  gapMs: 60,
};

export const kingFelled: HapticSequence = {
  pulses: [
    { intensity: 0.5, durationMs: 20 },
    { intensity: 0.65, durationMs: 20 },
    { intensity: 0.85, durationMs: 35 },
  ],
  gapMs: 70,
};

export const roundCleared: HapticSequence = {
  pulses: [
    { intensity: 0.3, durationMs: 20 },
    { intensity: 0.55, durationMs: 20 },
    { intensity: 0.85, durationMs: 35 },
  ],
  gapMs: 80,
};
