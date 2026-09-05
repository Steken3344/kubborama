/**
 * ALL tunables live here (or in the JSON files this module loads) — the
 * single source of truth. No three.js/IWSDK/Havok imports: this module
 * must stay usable from src/core/* tests and from scene-asset modules
 * alike.
 */
import {
  computeCourtLayout,
  computeStickRackPositions,
} from './core/court-layout.js';
import type { CourtLayout, StickSpawn } from './core/court-layout.js';
import type { Vec3 } from './core/vec3.js';
import audioData from './data/audio.json' with { type: 'json' };
import courtPresetsData from './data/court-presets.json' with { type: 'json' };
import gameModesData from './data/game-modes.json' with { type: 'json' };
import piecesData from './data/pieces.json' with { type: 'json' };
import cameraPosesData from './data/camera-poses.json' with { type: 'json' };
import windIndicatorData from './data/wind-indicator.json' with { type: 'json' };
import sinBinData from './data/sin-bin.json' with { type: 'json' };
import stickRackData from './data/stick-rack.json' with { type: 'json' };
import multiplayerData from './data/multiplayer.json' with { type: 'json' };
import matchData from './data/match.json' with { type: 'json' };

export const courtPresets = courtPresetsData.presets;
export type CourtPresetName = keyof typeof courtPresets;
export const defaultCourtPreset = courtPresetsData.default as CourtPresetName;

export const gameModes = gameModesData;
export type GameModeName = keyof typeof gameModes;

export function getGameMode(name: GameModeName) {
  return gameModes[name];
}

/** game-modes.json's courtPreset strings are authored to reference
 * court-presets.json's keys, but a plain JSON import widens both to
 * `string` — this is the one place that contract gets asserted back
 * into `CourtPresetName`, so consumers (CourtLayoutSystem) don't each
 * repeat the cast. */
export function courtPresetForMode(name: GameModeName): CourtPresetName {
  return gameModes[name].courtPreset as CourtPresetName;
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
export const windIndicator = windIndicatorData;
export const sinBin = sinBinData;
export const stickRack = stickRackData;
export const multiplayer = multiplayerData;
/** MP3a match rules: king-decision grace and the auto-restart delay. */
export const match = matchData;

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
): CourtLayout {
  return computeCourtLayout(getCourtPreset(presetName), {
    kingHeightM: pieces.king.heightM,
    kubbHeightM: pieces.kubb.heightM,
    stakeHeightM: pieces.stake.heightM,
    stickRadiusM: pieces.stick.radiusM,
  });
}

/** Fixed physical rack beside the player — not preset-dependent (see
 * computeStickRackPositions), so this never needs a preset argument. */
export function stickRackLayout(): StickSpawn[] {
  return computeStickRackPositions(stickRack, pieces.stick.radiusM);
}
