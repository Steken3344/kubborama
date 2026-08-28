/**
 * Pure SFX-selection logic. IWSDK's AudioSource component has no
 * pitch/playbackRate field (verified by reading
 * node_modules/@iwsdk/core/dist/audio/audio.js end to end — see
 * docs/DECISIONS.md, M5) so unlike PLAN.md's original "±10% pitch
 * randomize" idea, anti-repetition here comes entirely from picking
 * between pre-recorded variants.
 */

/** `rng` must return a value in [0, 1) — createRng (core/rng.ts) does. */
export function pickVariantIndex(
  rng: () => number,
  variantCount: number,
): number {
  return Math.floor(rng() * variantCount);
}

export type StickImpactTier = 'soft' | 'light' | 'medium';

/**
 * A stick's generic Impact event carries no info about what it hit
 * (see docs/DECISIONS.md, M5) — this approximates "ground" / "another
 * stick" / "a kubb" from force alone: a gentle settle onto grass is a
 * low-force impact, a solid klonk against a kubb is a high-force one.
 */
export function stickImpactTier(
  normalizedForce: number,
  softMaxNormalized: number,
  lightMaxNormalized: number,
): StickImpactTier {
  if (normalizedForce < softMaxNormalized) {
    return 'soft';
  }
  if (normalizedForce < lightMaxNormalized) {
    return 'light';
  }
  return 'medium';
}
