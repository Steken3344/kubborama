import { farBaselineZ } from './court-layout.js';
import type { CourtPreset, Vec3 } from './court-layout.js';
import type { MatchSide } from './match.js';

/**
 * MP4 (docs/superpowers/specs/2026-09-26-field-kubbs-design.md): where
 * the two court halves are, for inkast legality and raising. The near
 * baseline is z = 0 (host), the far baseline z = −L (guest), the centre
 * line z = −L/2, the sidelines x = ±W/2 (core/court-layout.ts).
 */
export interface CourtHalves {
  halfWidthM: number;
  nearBaselineZ: number;
  centreZ: number;
  farBaselineZ: number;
}

export interface CourtPoint {
  x: number;
  z: number;
}

export function courtHalves(preset: CourtPreset): CourtHalves {
  const far = farBaselineZ(preset);
  return {
    halfWidthM: preset.widthM / 2,
    nearBaselineZ: 0,
    centreZ: far / 2,
    farBaselineZ: far,
  };
}

/** Host half [centre, near], guest half [far, centre]. */
export function halfBounds(
  h: CourtHalves,
  side: MatchSide,
): { minZ: number; maxZ: number } {
  return side === 'host'
    ? { minZ: h.centreZ, maxZ: h.nearBaselineZ }
    : { minZ: h.farBaselineZ, maxZ: h.centreZ };
}

/** A point exactly on the centre line counts as the host half — one
 * deterministic owner, so the two clients can never disagree. */
export function halfOfZ(h: CourtHalves, z: number): MatchSide {
  return z >= h.centreZ ? 'host' : 'guest';
}

/** Lines count as in (Kubb-VM: a kubb touching a line is in). */
export function isLegalLanding(
  h: CourtHalves,
  side: MatchSide,
  x: number,
  z: number,
): boolean {
  const { minZ, maxZ } = halfBounds(h, side);
  return Math.abs(x) <= h.halfWidthM && z >= minZ && z <= maxZ;
}

/** House rule for a second failed toss: the nearest point inside the
 * target half, `insetM` in from every line. */
export function clampIntoHalf(
  h: CourtHalves,
  side: MatchSide,
  x: number,
  z: number,
  insetM: number,
): CourtPoint {
  const { minZ, maxZ } = halfBounds(h, side);
  const limitX = h.halfWidthM - insetM;
  return {
    x: round(Math.min(limitX, Math.max(-limitX, x))),
    z: round(Math.min(maxZ - insetM, Math.max(minZ + insetM, z))),
  };
}

/** Raising must not stand a kubb inside another piece (Havok would
 * explode the overlap): step along x past the first piece that is
 * closer than `minSeparationM` — to the other side of it if the step
 * would cross a sideline. Bounded; returns the last candidate. */
export function nudgeClear(
  p: CourtPoint,
  others: ReadonlyArray<CourtPoint>,
  minSeparationM: number,
  h: CourtHalves,
): CourtPoint {
  let x = p.x;
  for (let i = 0; i < 10; i++) {
    const blocker = others.find(
      (o) => Math.hypot(o.x - x, o.z - p.z) < minSeparationM,
    );
    if (!blocker) {
      break;
    }
    const dir = x >= blocker.x ? 1 : -1;
    let next = blocker.x + dir * minSeparationM;
    if (Math.abs(next) > h.halfWidthM) {
      next = blocker.x - dir * minSeparationM;
    }
    x = next;
  }
  return { x: round(x), z: p.z };
}

/** Millimetre rounding keeps float noise out of states and tests. */
function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export interface InkastRackLayout {
  offsetM: number;
  spacingM: number;
  kubbHeightM: number;
}

/** Slot `slot` of `count` in the inkast rack: a row of upright kubbs
 * `offsetM` behind the THROWER's own baseline (outside the court), so
 * they are at hand where the thrower stands. */
export function inkastRackPosition(
  h: CourtHalves,
  thrower: MatchSide,
  slot: number,
  count: number,
  rack: InkastRackLayout,
): Vec3 {
  const z =
    thrower === 'host'
      ? h.nearBaselineZ + rack.offsetM
      : h.farBaselineZ - rack.offsetM;
  return [
    round((slot - (count - 1) / 2) * rack.spacingM),
    rack.kubbHeightM / 2,
    round(z),
  ];
}
