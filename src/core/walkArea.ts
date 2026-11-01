import type { CourtHalves } from './inkast.js';
import { isFreshMatch } from './match.js';
import type { MatchSide, MatchState } from './match.js';

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

/** Whether a body of `radiusM` at (x, z) overlaps any footprint. */
function overlapsAny(
  x: number,
  z: number,
  footprints: readonly Footprint[],
  radiusM: number,
): boolean {
  for (const f of footprints) {
    if (
      Math.abs(x - f.x) < f.halfX + radiusM &&
      Math.abs(z - f.z) < f.halfZ + radiusM
    ) {
      return true;
    }
  }
  return false;
}

/**
 * The tables are solid (Erik, 2026-11-01: "man inte kan flyta igenom
 * bordet"): a thumbstick slide of `slide` (x/z, m) that would carry a
 * body of `radiusM` around `head` (x/z, after the slide) into a table is
 * cut back, IN PLACE — first only the axis that enters, so the player
 * can still slide along a table's edge. Never a push: a head already in
 * a footprint before the slide (leaning over a table in the room) is
 * left alone. Every frame — allocates nothing. Returns whether it cut.
 */
export function blockSlideIntoFootprints(
  head: { x: number; z: number },
  slide: { x: number; z: number },
  footprints: readonly Footprint[],
  radiusM: number,
): boolean {
  if (!overlapsAny(head.x, head.z, footprints, radiusM)) {
    return false;
  }
  const fromX = head.x - slide.x;
  const fromZ = head.z - slide.z;
  if (overlapsAny(fromX, fromZ, footprints, radiusM)) {
    return false; // already in it before this slide
  }
  if (!overlapsAny(head.x, fromZ, footprints, radiusM)) {
    slide.z = 0; // keep the sideways part
  } else if (!overlapsAny(fromX, head.z, footprints, radiusM)) {
    slide.x = 0;
  } else {
    slide.x = 0;
    slide.z = 0;
  }
  return true;
}

/**
 * Where a thrower's head is put when its turn starts (Erik, 2026-11-01:
 * his partner, new to games, kept walking into the headset's boundary
 * to throw and found the thumbstick hard): centred on the court, just
 * behind its own baseline. The rig moves so the head lands here —
 * wherever the player stands in the room becomes the throwing spot, so
 * nobody has to walk to it. Side A faces −z, side B +z.
 */
export function throwSpot(
  side: MatchSide,
  halves: CourtHalves,
  behindLineM: number,
): { x: number; z: number } {
  return side === 'host'
    ? { x: 0, z: halves.nearBaselineZ + behindLineM }
    : { x: 0, z: halves.farBaselineZ - behindLineM };
}

/**
 * When to put me on my throwing spot (throwSpot): a key per turn and
 * phase of MINE in an undecided match — '' otherwise. A new non-empty
 * key (compared with the last one) re-centres; a fresh match always
 * does, even when its first key equals the last match's (review,
 * 2026-11-01: after Ny runda in my own turn the starter was not
 * re-centred on the opening turn).
 */
export function recentreKey(
  state: MatchState | null,
  mySide: MatchSide | null,
): string {
  if (!state || mySide === null || state.winner !== null) {
    return '';
  }
  if (state.currentTurn !== mySide) {
    return '';
  }
  return `${state.currentTurn}/${state.phase}`;
}

/** `wasFresh`: the previous state was already a fresh match — the same
 * fresh state broadcast again must not pull me back mid-turn. */
export function shouldRecentre(
  state: MatchState | null,
  mySide: MatchSide | null,
  lastKey: string,
  wasFresh: boolean,
): boolean {
  const key = recentreKey(state, mySide);
  if (key === '') {
    return false;
  }
  const becameFresh = state !== null && isFreshMatch(state) && !wasFresh;
  return key !== lastKey || becameFresh;
}
