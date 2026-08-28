/**
 * ALL tunables live here (or in the JSON files this module loads) — the
 * single source of truth. No three.js/IWSDK/Havok imports: this module
 * must stay usable from src/core/* tests and from scene-asset modules
 * alike.
 */
import { computeCourtLayout } from './core/court-layout.js';
import type { CourtLayout } from './core/court-layout.js';
import type { Vec3 } from './core/vec3.js';
import audioData from './data/audio.json' with { type: 'json' };
import courtPresetsData from './data/court-presets.json' with { type: 'json' };
import gameModesData from './data/game-modes.json' with { type: 'json' };
import piecesData from './data/pieces.json' with { type: 'json' };
import cameraPosesData from './data/camera-poses.json' with { type: 'json' };

export const courtPresets = courtPresetsData.presets;
export type CourtPresetName = keyof typeof courtPresets;
export const defaultCourtPreset = courtPresetsData.default as CourtPresetName;

export const gameModes = gameModesData;
export type GameModeName = keyof typeof gameModes;

export function getGameMode(name: GameModeName) {
  return gameModes[name];
}

/** Wind direction is fixed (lateral — across the court width, the X
 * axis) per docs/PLAN.md §1; only magnitude varies per game mode. */
export function windVectorForMode(name: GameModeName): Vec3 {
  return [gameModes[name].windMps, 0, 0];
}

export const audio = audioData;
export const pieces = piecesData;
export type MaterialName = keyof typeof pieces.materials;
export const defaultMaterial = pieces.defaultMaterial as MaterialName;

export const cameraPoses = cameraPosesData;

/**
 * Fixed seed for the static M1 stick-scatter layout — the same six
 * sticks land in the same spots every load. Not a gameplay RNG (no
 * player-visible randomness depends on this beyond initial dressing).
 */
export const STICK_LAYOUT_SEED = 1337;

export function getCourtPreset(name: CourtPresetName = defaultCourtPreset) {
  return courtPresets[name];
}

export function materialDensityKgM3(material: MaterialName = defaultMaterial) {
  return pieces.materials[material].densityKgM3;
}

export function stickMassKg(material?: MaterialName): number {
  const { radiusM, lengthM } = pieces.stick;
  const volumeM3 = Math.PI * radiusM * radiusM * lengthM;
  return volumeM3 * materialDensityKgM3(material);
}

export function kubbMassKg(material?: MaterialName): number {
  const { widthM, heightM, depthM } = pieces.kubb;
  const volumeM3 = widthM * heightM * depthM;
  return volumeM3 * materialDensityKgM3(material);
}

export function kingMassKg(material?: MaterialName): number {
  const { widthM, heightM, depthM, crownVolumeFactor } = pieces.king;
  const volumeM3 = widthM * heightM * depthM * crownVolumeFactor;
  return volumeM3 * materialDensityKgM3(material);
}

export function courtLayout(
  presetName: CourtPresetName = defaultCourtPreset,
  seed: number = STICK_LAYOUT_SEED,
): CourtLayout {
  return computeCourtLayout(
    getCourtPreset(presetName),
    {
      kingHeightM: pieces.king.heightM,
      kubbHeightM: pieces.kubb.heightM,
      stakeHeightM: pieces.stake.heightM,
      stickRadiusM: pieces.stick.radiusM,
    },
    seed,
  );
}
