import { createRng } from './rng.js';

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
  stickSpawnPositions: StickSpawn[];
}

const STICK_SCATTER_MARGIN_M = 0.15;
const STICK_SCATTER_NEAR_Z = -0.15;
const STICK_SCATTER_FAR_Z = -0.9;
const STICK_COUNT = 6;
const KUBB_COUNT = 5;

/**
 * Player origin is world (0,0,0), facing -Z. The near baseline (player's
 * baseline) sits at z=0; the far baseline (kubbs + king row) sits at
 * z=-lengthM. X is centered on the court width.
 */
export function computeCourtLayout(
  preset: CourtPreset,
  dims: PieceDims,
  seed: number,
): CourtLayout {
  const halfWidthM = preset.widthM / 2;
  const farZ = -preset.lengthM;
  const centerZ = -preset.lengthM / 2;

  const kingPosition: Vec3 = [0, dims.kingHeightM / 2, centerZ];

  // Evenly spaced across the baseline width, each kubb centered in its
  // own 1/5 segment (keeps the outer kubbs inset from the corner stakes).
  const kubbPositions: Vec3[] = Array.from({ length: KUBB_COUNT }, (_, i) => {
    const x = -halfWidthM + (preset.widthM * (i + 0.5)) / KUBB_COUNT;
    return [x, dims.kubbHeightM / 2, farZ];
  });

  const stakeY = dims.stakeHeightM / 2;
  const stakePositions: Vec3[] = [
    [-halfWidthM, stakeY, 0],
    [halfWidthM, stakeY, 0],
    [-halfWidthM, stakeY, farZ],
    [halfWidthM, stakeY, farZ],
  ];

  const rng = createRng(seed);
  const scatterHalfWidthM = halfWidthM - STICK_SCATTER_MARGIN_M;
  const stickSpawnPositions: StickSpawn[] = Array.from(
    { length: STICK_COUNT },
    () => {
      const x = (rng() * 2 - 1) * scatterHalfWidthM;
      const z =
        STICK_SCATTER_NEAR_Z +
        rng() * (STICK_SCATTER_FAR_Z - STICK_SCATTER_NEAR_Z);
      const yawRad = rng() * Math.PI * 2;
      return { position: [x, dims.stickRadiusM, z], yawRad };
    },
  );

  return { kingPosition, kubbPositions, stakePositions, stickSpawnPositions };
}
