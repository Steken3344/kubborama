import type { Vec3 } from './vec3.js';

export interface SinBinConfig {
  xM: number;
  startZM: number;
  spacingM: number;
  /** Foot-faulted sticks (2026-10-31): their own row, a stick length
   * apart — a stick lies along z and would overlap at kubb spacing. */
  stickXM: number;
  stickSpacingM: number;
}

/**
 * Position of the Nth (0-indexed) kubb set aside once felled in
 * Simple mode's rules (real kubb: felled pieces are placed beside the
 * court, out of play). A fixed row independent of the active court
 * preset — a mode/preset switch already clears the sin bin via the
 * existing Reset pipeline, so there is never an already-placed kubb
 * to reconcile against a newly active preset.
 */
export function sinBinSlotPosition(
  index: number,
  kubbHeightM: number,
  config: SinBinConfig,
): Vec3 {
  return [config.xM, kubbHeightM / 2, config.startZM - index * config.spacingM];
}

/** Where the `index`-th foot-faulted stick of a round lies. */
export function stickSinBinSlotPosition(
  index: number,
  stickRadiusM: number,
  config: SinBinConfig,
): Vec3 {
  return [
    config.stickXM,
    stickRadiusM,
    config.startZM - index * config.stickSpacingM,
  ];
}
