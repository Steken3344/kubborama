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
import type { InkastRackLayout, RetiredKubbLayout } from './core/inkast.js';
import type { Vec3 } from './core/vec3.js';
import audioData from './data/audio.json' with { type: 'json' };
import courtPresetsData from './data/court-presets.json' with { type: 'json' };
import gameModesData from './data/game-modes.json' with { type: 'json' };
import piecesData from './data/pieces.json' with { type: 'json' };
import cameraPosesData from './data/camera-poses.json' with { type: 'json' };
import inkastData from './data/inkast.json' with { type: 'json' };
import inkastGuideData from './data/inkast-guide.json' with { type: 'json' };
import sinBinData from './data/sin-bin.json' with { type: 'json' };
import stickRackData from './data/stick-rack.json' with { type: 'json' };
import kubbTableData from './data/kubb-table.json' with { type: 'json' };
import multiplayerData from './data/multiplayer.json' with { type: 'json' };
import matchData from './data/match.json' with { type: 'json' };
import avatarData from './data/avatar.json' with { type: 'json' };
import avatarPaletteData from './data/avatar-palette.json' with { type: 'json' };
import roundData from './data/round.json' with { type: 'json' };
import locomotionData from './data/locomotion.json' with { type: 'json' };
import uiData from './data/ui.json' with { type: 'json' };
import spectatorData from './data/spectator.json' with { type: 'json' };
import staticBatchData from './data/static-batch.json' with { type: 'json' };
import confettiData from './data/confetti.json' with { type: 'json' };
import botData from './data/bot.json' with { type: 'json' };
import stickGripData from './data/stick-grip.json' with { type: 'json' };
import profileNamesData from './data/profile-names.json' with { type: 'json' };
import stoneWallData from './data/stone-wall.json' with { type: 'json' };

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
export const sinBin = sinBinData;
/** Thumbstick locomotion's walk area (core/walkArea.ts). */
export const walkArea = {
  halfWidthM: locomotionData.walkAreaHalfWidthM,
  minZ: locomotionData.walkAreaMinZ,
  maxZ: locomotionData.walkAreaMaxZ,
};
/** The menu's fixed profile names — the server accepts only these. */
export const profileNames: readonly string[] = profileNamesData.names;
/** Scene nodes whose meshes are merged per material at startup
 * (systems/staticBatch.ts) — static props only, never pieces or UI. */
export const staticBatchNodePatterns: readonly RegExp[] =
  staticBatchData.nodeIdPatterns.map((p) => new RegExp(p, 'u'));
/** Victory confetti (core/confetti.ts, systems/confetti.ts). */
export const confetti = confettiData;
/** The spectator TV view's director and overlay tunables. */
export const spectator = spectatorData;
/** Menu buttons ignore a repeat click within this long (gh#27). */
export const ui = uiData;
/** Where the head is put at a turn's start, behind the baseline (m). */
export const standBehindLineM = locomotionData.standBehindLineM;

/** The player's body radius against the tables (core/walkArea.ts). */
export const tableBodyRadiusM = locomotionData.tableBodyRadiusM;

/** How far past the throwing line the head may lean (core/walkArea.ts). */
export const lineLeanAllowanceM = locomotionData.lineLeanAllowanceM;
/** A stick released further than this past the throwing line is a
 * foot fault (core/walkArea.ts isFootFault, judged by the server). */
export const footFaultReachM = locomotionData.footFaultReachM;
/** MP4 inkast tunables (docs/superpowers/specs/2026-09-26-field-kubbs-design.md). */
export const inkast = inkastData;
/** The backyard inkast aid: the target half outlined on the grass. */
export const inkastGuide = inkastGuideData;
/** How a held stick sits in the hand (core/stickGrip.ts). */
export const stickGrip = stickGripData;
export const stickRack = stickRackData;
/** The table the inkast kubbs wait on, near side (core/inkast.ts). */
export const kubbTable = kubbTableData;
/** core/inkast.ts inkastRackPosition's layout: the kubb table, one place. */
export function inkastTableLayout(): InkastRackLayout {
  return {
    tableXM: kubbTableData.xM,
    tableZM: kubbTableData.zM,
    topM: kubbTableData.topM,
    columns: kubbTableData.columns,
    columnSpacingM: kubbTableData.columnSpacingM,
    rowSpacingM: kubbTableData.rowSpacingM,
    kubbHeightM: piecesData.kubb.heightM,
  };
}
/** core/inkast.ts retiredKubbPosition's layout (simplified rules). */
export function retiredKubbLayout(): RetiredKubbLayout {
  return {
    sideOffsetM: inkastData.retiredSideOffsetM,
    spacingM: inkastData.retiredSpacingM,
    lyingHeightM: piecesData.kubb.widthM / 2,
  };
}
/** The low dry-stone wall along the garden ground's edge
 * (scene-assets/stone-wall.scene-asset.ts). */
export const stoneWall = stoneWallData;
export const multiplayer = multiplayerData;
/** MP3a match rules: king-decision grace and the auto-restart delay. */
export const match = matchData;
/** MP3b procedural peer-avatar body dimensions (core/avatarPose.ts). */
export const avatar = avatarData;
/** gh#17: how long the court must be quiet after the 6th stick settles
 * before the round ends, and the cap that guarantees it ends anyway. */
export const round = roundData;
/** MP3b player-chosen avatar colors — no green, it vanishes against the
 * grass. Indexed by settings.avatarColorIndex / presence colorIndex. */
export const avatarPalette = avatarPaletteData;

/** Clamps a (possibly remote, possibly stale) index onto the palette. */
export function avatarPaletteEntry(index: number) {
  const clamped = Math.min(
    Math.max(0, Math.trunc(index)),
    avatarPalette.length - 1,
  );
  const entry = avatarPalette[clamped];
  if (!entry) {
    // Only reachable with an empty palette file — a config error worth
    // failing loudly on rather than inventing a color here.
    throw new Error('avatar-palette.json must contain at least one color');
  }
  return entry;
}

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

/** The single-player bot opponent (core/botBrain.ts): levels, pacing. */
export const bot = botData;
export type BotLevel = keyof typeof botData.levels;
export const BOT_LEVELS = Object.keys(botData.levels) as BotLevel[];
