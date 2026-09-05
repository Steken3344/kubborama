import { STICKS_PER_ROUND } from './scoring.js';

export type Vec3 = [x: number, y: number, z: number];

/**
 * Court dimensions. Baselines are the SHORT (width) sides — the 5 kubbs
 * stand along the short edge, and the LONG dimension (length) is the
 * throw distance between the two baselines. Easy to get backwards.
 */
export interface CourtPreset {
  widthM: number;
  lengthM: number;
}

export interface PieceDims {
  kingHeightM: number;
  kubbHeightM: number;
  stakeHeightM: number;
  stickRadiusM: number;
}

export interface StickSpawn {
  position: Vec3;
  yawRad: number;
}

export interface CourtLayout {
  kingPosition: Vec3;
  kubbPositions: Vec3[];
  stakePositions: Vec3[];
}

// The near baseline's z=0 line is also the player's spawn origin (scene
// JSON has no authored player.transform, so the player materialises at
// world 0,0,0 — see docs/DECISIONS.md). A kubb centered at x=0 there
// would land exactly on the player's spawn point, so the near row is set
// back a touch into the court instead of sitting exactly on the line.
const NEAR_BASELINE_SETBACK_M = 0.05;
/** Per baseline; exported so consumers (e.g. the stats display's
 * felled-out-of-total count) don't re-hardcode the piece total. */
export const KUBB_COUNT = 5;

/** The far baseline's z — the player origin is the near baseline at
 * z=0 facing -Z (see computeCourtLayout). Shared by everything that
 * mirrors to the far end (player teleport, second stick rack, guest
 * sin-bin row) so no system hardcodes the default preset's length
 * (spec review I5: Advanced uses the 8 m tournament court). */
export function farBaselineZ(preset: CourtPreset): number {
  return -preset.lengthM;
}

/**
 * Player origin is world (0,0,0), facing -Z. The near baseline (player's
 * baseline) sits at z=0; the far baseline (kubbs + king row) sits at
 * z=-lengthM. X is centered on the court width. Deterministic (no RNG
 * needed) — court/kubb/stake geometry has no randomness.
 */
export function computeCourtLayout(
  preset: CourtPreset,
  dims: PieceDims,
): CourtLayout {
  const halfWidthM = preset.widthM / 2;
  const farZ = -preset.lengthM;
  const centerZ = -preset.lengthM / 2;

  const kingPosition: Vec3 = [0, dims.kingHeightM / 2, centerZ];

  // Evenly spaced across the baseline width, each kubb centered in its
  // own 1/5 segment (keeps the outer kubbs inset from the corner stakes).
  // Full set: 5 per baseline (docs/PLAN.md §2b) — index 0-4 is the far
  // row, 5-9 mirrors it onto the near (player's) baseline at z=0.
  const kubbRow = (z: number): Vec3[] =>
    Array.from({ length: KUBB_COUNT }, (_, i) => {
      const x = -halfWidthM + (preset.widthM * (i + 0.5)) / KUBB_COUNT;
      return [x, dims.kubbHeightM / 2, z];
    });
  const kubbPositions: Vec3[] = [
    ...kubbRow(farZ),
    ...kubbRow(-NEAR_BASELINE_SETBACK_M),
  ];

  const stakeY = dims.stakeHeightM / 2;
  const stakePositions: Vec3[] = [
    [-halfWidthM, stakeY, 0],
    [halfWidthM, stakeY, 0],
    [-halfWidthM, stakeY, farZ],
    [halfWidthM, stakeY, farZ],
  ];

  return { kingPosition, kubbPositions, stakePositions };
}

export interface StickRackConfig {
  xM: number;
  zM: number;
  plankTopM: number;
  spacingM: number;
  /** Rotation of the whole rack around Y, radians. 0 lays the row along
   * world X (the original placement); a rack turned to sit flush against
   * a wall/fence at another angle (Erik's 2026-08-30 relocation) uses a
   * nonzero value instead of a second layout function. */
  yawRad: number;
}

/**
 * A neat, fixed row of STICKS_PER_ROUND slots on a physical rack beside
 * the player (Erik's feedback, 2026-08-30: bending down to the grass to
 * pick up a stick, over and over, got tiring). Deliberately NOT
 * court-preset-dependent — the player origin is always world (0,0,0)
 * regardless of court size — and deliberately NOT randomized: a real
 * rack holds sticks in tidy parallel slots, not a scatter, so unlike
 * computeCourtLayout's earlier stick logic this needs no seed. Replaces
 * the M1-era ground-scatter design entirely (see docs/DECISIONS.md for
 * why, and for the "kubb spawning inside a scattered stick" bug that
 * design used to risk — moot now that sticks never share ground space
 * with kubbs at all).
 */
export function computeStickRackPositions(
  config: StickRackConfig,
  stickRadiusM: number,
): StickSpawn[] {
  const y = config.plankTopM + stickRadiusM;
  const totalWidthM = (STICKS_PER_ROUND - 1) * config.spacingM;
  const cosYaw = Math.cos(config.yawRad);
  const sinYaw = Math.sin(config.yawRad);
  return Array.from({ length: STICKS_PER_ROUND }, (_, i) => {
    const localOffsetM = i * config.spacingM - totalWidthM / 2;
    return {
      position: [
        config.xM + localOffsetM * cosYaw,
        y,
        config.zM - localOffsetM * sinYaw,
      ],
      yawRad: Math.PI / 2 + config.yawRad,
    };
  });
}
