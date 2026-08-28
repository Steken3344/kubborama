/**
 * Tiny shared math helpers. Extracted once a second consumer needed the
 * same "clamp to [0,1], then linearly remap" shape (core/haptics.ts's
 * impactRumble was first; core/audio.ts's volume-from-force is second) —
 * see docs/DECISIONS.md (M5).
 */

/** `value / maxValue`, clamped to [0, 1]. */
export function normalizedClamped(value: number, maxValue: number): number {
  return Math.min(1, Math.max(0, value / maxValue));
}

/** Linear interpolation: `t=0` → `min`, `t=1` → `max`. `t` is not clamped
 * here — clamp the input (e.g. via `normalizedClamped`) if that matters. */
export function lerp(t: number, min: number, max: number): number {
  return min + t * (max - min);
}
