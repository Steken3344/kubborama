import type { MatchState } from './match.js';
import { kubbIndexFromId, kubbSide } from './match.js';
import { mirrorPoseToFarBaseline } from './presence.js';
import { sinBinSlotPosition } from './sinBin.js';
import type { SinBinConfig } from './sinBin.js';
import type { Vec3 } from './vec3.js';

export interface SinBinPlacement {
  kubbId: string;
  position: Vec3;
  quaternion: [number, number, number, number];
}

export interface SinBinPlacementOptions {
  sinBin: SinBinConfig;
  kubbHeightM: number;
  /** farBaselineZ(activePreset) — the guest row is the host row
   * mirrored to the far end. */
  farZ: number;
  kubbsPerSide?: number;
}

const IDENTITY: [number, number, number, number] = [0, 0, 0, 1];

/**
 * Where every felled kubb in `state` sits, derived from the state alone:
 * slot = its index in its side's `felledKubbIds` list (never a counter —
 * a late-joining guest's first snapshot can carry several ids at once,
 * spec review I7). Host-side kubbs (kubb-5..9) use the authored sin-bin
 * row beside the near baseline; guest-side kubbs use the same row
 * mirrored to the far baseline with the one transform every far-end
 * placement shares. Both clients evaluate this from identical state, so
 * they agree without any extra message.
 */
export function sinBinPlacements(
  state: MatchState,
  opts: SinBinPlacementOptions,
): SinBinPlacement[] {
  const placements: SinBinPlacement[] = [];
  for (const side of ['guest', 'host'] as const) {
    state.felledKubbIds[side].forEach((kubbId, slot) => {
      const index = kubbIndexFromId(kubbId);
      if (index === null || kubbSide(index, opts.kubbsPerSide) !== side) {
        return;
      }
      const near = {
        position: sinBinSlotPosition(slot, opts.kubbHeightM, opts.sinBin),
        quaternion: IDENTITY,
      };
      const pose =
        side === 'host' ? near : mirrorPoseToFarBaseline(near, opts.farZ);
      placements.push({
        kubbId,
        position: pose.position,
        quaternion: pose.quaternion,
      });
    });
  }
  return placements;
}
