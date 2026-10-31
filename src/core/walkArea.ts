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
