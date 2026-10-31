import type { Vec3 } from './vec3.js';

/**
 * Victory confetti (Erik, 2026-10-31: "när man vinner får det gärna bli
 * lite konfetti"). Pure particle physics, stepped in place so the shell
 * (systems/confetti.ts) allocates nothing per frame:
 *
 * - a burst: every piece starts at the origin with an upward cone of
 *   speeds (seeded — the same seed throws the same burst);
 * - gravity plus strong linear drag, v' = g − k·v, so paper falls at a
 *   gentle terminal speed g/k instead of like a stone;
 * - a sideways flutter, a sine per piece, so they drift as they fall;
 * - a tumble angle per piece for the shell to turn the quads by;
 * - pieces that reach the grass lie there until the burst is over.
 */
export interface ConfettiOptions {
  count: number;
  burstSpeedMps: number;
  gravityMps2: number;
  dragPerS: number;
  flutterAmplitudeMps: number;
  flutterRadPerS: number;
  spinRadPerS: number;
  lifetimeS: number;
  /** How many colours the shell has: pieces get an index below it. */
  colorCount: number;
}

export interface ConfettiState {
  /** x, y, z per piece. */
  positions: Float32Array;
  velocities: Float32Array;
  /** Tumble angle per piece (rad) and its rate. */
  angles: Float32Array;
  spinRates: Float32Array;
  /** Flutter phase per piece (rad). */
  phases: Float32Array;
  colors: Uint8Array;
  ageS: number;
}

/** Lying on the grass: just above it, so it doesn't z-fight. */
const REST_HEIGHT_M = 0.005;

export function burstConfetti(
  origin: Vec3,
  opts: ConfettiOptions,
  rng: () => number,
): ConfettiState {
  const n = opts.count;
  const s: ConfettiState = {
    positions: new Float32Array(n * 3),
    velocities: new Float32Array(n * 3),
    angles: new Float32Array(n),
    spinRates: new Float32Array(n),
    phases: new Float32Array(n),
    colors: new Uint8Array(n),
    ageS: 0,
  };
  for (let i = 0; i < n; i += 1) {
    s.positions[i * 3] = origin[0];
    s.positions[i * 3 + 1] = origin[1];
    s.positions[i * 3 + 2] = origin[2];
    // An upward cone: mostly up, some out in every direction.
    const headingRad = 2 * Math.PI * rng();
    const out = opts.burstSpeedMps * 0.55 * rng();
    const up = opts.burstSpeedMps * (0.55 + 0.45 * rng());
    s.velocities[i * 3] = Math.cos(headingRad) * out;
    s.velocities[i * 3 + 1] = up;
    s.velocities[i * 3 + 2] = Math.sin(headingRad) * out;
    s.angles[i] = 2 * Math.PI * rng();
    s.spinRates[i] = opts.spinRadPerS * (0.5 + rng()) * (rng() < 0.5 ? -1 : 1);
    s.phases[i] = 2 * Math.PI * rng();
    s.colors[i] = Math.min(
      opts.colorCount - 1,
      Math.floor(rng() * opts.colorCount),
    );
  }
  return s;
}

export function stepConfetti(
  s: ConfettiState,
  dtS: number,
  opts: ConfettiOptions,
): void {
  s.ageS += dtS;
  const n = s.angles.length;
  const damp = Math.exp(-opts.dragPerS * dtS);
  for (let i = 0; i < n; i += 1) {
    const yi = i * 3 + 1;
    if ((s.positions[yi] ?? 0) <= REST_HEIGHT_M) {
      continue; // on the grass
    }
    const phase = (s.phases[i] ?? 0) + opts.flutterRadPerS * s.ageS;
    // Drag towards the terminal velocity, gravity on y.
    const vx = (s.velocities[i * 3] ?? 0) * damp;
    const vy = (s.velocities[yi] ?? 0) * damp - opts.gravityMps2 * dtS;
    const vz = (s.velocities[i * 3 + 2] ?? 0) * damp;
    s.velocities[i * 3] = vx;
    s.velocities[yi] = vy;
    s.velocities[i * 3 + 2] = vz;
    const flutter = opts.flutterAmplitudeMps * Math.sin(phase);
    s.positions[i * 3] = (s.positions[i * 3] ?? 0) + (vx + flutter) * dtS;
    s.positions[i * 3 + 2] =
      (s.positions[i * 3 + 2] ?? 0) + (vz + flutter * 0.6) * dtS;
    const y = (s.positions[yi] ?? 0) + vy * dtS;
    s.positions[yi] = Math.max(REST_HEIGHT_M, y);
    s.angles[i] = (s.angles[i] ?? 0) + (s.spinRates[i] ?? 0) * dtS;
  }
}

export function confettiDone(s: ConfettiState, opts: ConfettiOptions): boolean {
  return s.ageS >= opts.lifetimeS;
}
