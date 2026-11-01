import type { MatchSide } from './match.js';

/**
 * Thumbstick locomotion (Erik, 2026-10-31) is limited to the garden:
 * a box around the court, inside the ring of trees, rocks and cliffs
 * (whose collision boxes are only rough, gh#7). The 30 m ground is the
 * walkable surface; this keeps the player from sliding out to its edge.
 */
export interface WalkArea {
  halfWidthM: number;
  minZ: number;
  maxZ: number;
}

/** Clamps `point` (x/z, metres) into `area` IN PLACE — called every
 * frame, so it allocates nothing. Returns whether it moved the point. */
export function clampToWalkArea(
  point: { x: number; z: number },
  area: WalkArea,
): boolean {
  const x = Math.min(area.halfWidthM, Math.max(-area.halfWidthM, point.x));
  const z = Math.min(area.maxZ, Math.max(area.minZ, point.z));
  if (x === point.x && z === point.z) {
    return false;
  }
  point.x = x;
  point.z = z;
  return true;
}

/**
 * Erik, 2026-10-31: "man skall inte kunna förflytta sig förbi
 * baslinjen" — no walking up to the kubbs. Given the head's world z,
 * returns how far (z) to move the rig so the head is at most
 * `leanAllowanceM` past `lineZ` (the player's baseline or advantage
 * line, core/match.ts standingLineZ); 0 when it already is. Side A
 * faces -z, side B +z. The allowance keeps a throw's forward lean
 * from shoving the world around; it still stops walking, by stick or
 * on foot.
 */
export function behindLineCorrectionZ(
  headZ: number,
  side: MatchSide,
  lineZ: number,
  leanAllowanceM: number,
): number {
  if (side === 'host') {
    const limit = lineZ - leanAllowanceM;
    return headZ < limit ? limit - headZ : 0;
  }
  const limit = lineZ + leanAllowanceM;
  return headZ > limit ? limit - headZ : 0;
}

/**
 * Foot fault (Erik, 2026-10-31: "känns som man kan göra övertramp"): a
 * stick released more than `reachM` past the thrower's line (its
 * baseline, or advantage line while throwing from it). The reach is the
 * lean allowance plus an arm, so a throw from behind the line never
 * trips it. Judged by the server on the release position the client
 * reports. Side A faces -z, side B +z.
 */
export function isFootFault(
  releaseZ: number,
  side: MatchSide,
  lineZ: number,
  reachM: number,
): boolean {
  return side === 'host'
    ? releaseZ < lineZ - reachM
    : releaseZ > lineZ + reachM;
}

/** A table's footprint on the ground: centre and half extents (m). */
export interface Footprint {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
}

/**
 * The tables are solid (Erik, 2026-11-01: "man inte kan flyta igenom
 * bordet"): a body of `radiusM` around `point` (the head, x/z) inside a
 * footprint is pushed out the shortest way, IN PLACE. Every frame —
 * allocates nothing. Returns whether it moved the point.
 */
export function pushOutOfFootprints(
  point: { x: number; z: number },
  footprints: readonly Footprint[],
  radiusM: number,
): boolean {
  let moved = false;
  for (const f of footprints) {
    const dx = point.x - f.x;
    const dz = point.z - f.z;
    const overX = f.halfX + radiusM - Math.abs(dx);
    const overZ = f.halfZ + radiusM - Math.abs(dz);
    if (overX <= 0 || overZ <= 0) {
      continue;
    }
    if (overX < overZ) {
      point.x += dx >= 0 ? overX : -overX;
    } else {
      point.z += dz >= 0 ? overZ : -overZ;
    }
    moved = true;
  }
  return moved;
}
