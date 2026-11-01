import { GRAVITY_MPS2 } from './aim.js';
import { otherSide } from './match.js';
import type { MatchSide, MatchState } from './match.js';
import type { Vec3 } from './vec3.js';

/**
 * Throw assistance (Erik, 2026-11-01: "kan vi göra något så man får
 * någon kast-assistans … så att det blir lite lättare att träffa, känns
 * jättesvårt idag"). A throw that would come down near a kubb the
 * thrower may legally aim at is bent part of the way towards it: the
 * landing point (at kubb height) moves `strength` of the way to the
 * nearest target within `radiusM`. Only the horizontal velocity changes —
 * the arc's height and flight time stay the thrower's own, so a lob is
 * still a lob. A throw nowhere near a target is left alone.
 */
export interface AimAssistOptions {
  /** 0 (off) … 1 (lands on the target). */
  strength: number;
  /** Only targets this close to the unassisted landing point (m). */
  radiusM: number;
  /** The height the landing point is taken at: a kubb's lower half. */
  aimHeightM: number;
}

/** The kubbs `side` may aim at now: standing field kubbs on the other
 * half first (rule 5), else that half's baseline kubbs, else the king. */
export function aimTargetIds(state: MatchState, side: MatchSide): string[] {
  const other = otherSide(side);
  const field = state.fieldKubbs
    .filter((k) => k.half === other)
    .map((k) => k.kubbId);
  if (field.length > 0) return field;
  const baseline = state.baselineKubbs[other];
  return baseline.length > 0 ? [...baseline] : ['king'];
}

/** When a body released at `from` with vertical speed `vy` comes back
 * down to `height` — the later root; null if it never gets there. */
function timeToHeight(from: Vec3, vy: number, height: number): number | null {
  const g = GRAVITY_MPS2;
  const disc = vy * vy + 2 * g * (from[1] - height);
  if (disc < 0) return null;
  const t = (vy + Math.sqrt(disc)) / g;
  return t > 0 ? t : null;
}

export function assistAim(
  from: Vec3,
  velocity: Vec3,
  targets: readonly Vec3[],
  opts: AimAssistOptions,
): Vec3 {
  if (opts.strength <= 0 || targets.length === 0) return velocity;
  const t = timeToHeight(from, velocity[1], opts.aimHeightM);
  if (t === null) return velocity;
  const landX = from[0] + velocity[0] * t;
  const landZ = from[2] + velocity[2] * t;
  let best: Vec3 | null = null;
  let bestD = opts.radiusM;
  for (const target of targets) {
    const d = Math.hypot(target[0] - landX, target[2] - landZ);
    if (d <= bestD) {
      bestD = d;
      best = target;
    }
  }
  if (!best) return velocity;
  const k = Math.min(1, opts.strength);
  const x = landX + (best[0] - landX) * k;
  const z = landZ + (best[2] - landZ) * k;
  return [(x - from[0]) / t, velocity[1], (z - from[2]) / t];
}
