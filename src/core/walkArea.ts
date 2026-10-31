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
