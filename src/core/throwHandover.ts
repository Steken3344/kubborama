import type { Vec3 } from './vec3.js';

/**
 * The LOCAL player's own throw in server mode (2026-10-31, with
 * core/snapshotBuffer.ts). Snapshots are rendered ~100 ms in the past,
 * and the server only learns of a throw when the release message
 * arrives — so right after letting go, the interpolated server pose is
 * still the stick on its rack. Rendering it would yank the stick out of
 * the hand back to the rack. Instead the released piece keeps its local
 * physics prediction until the render time reaches the first snapshot
 * in which the server has moved it, then blends from where the
 * prediction is to the server's pose over `blendS` (no visible jump),
 * then follows the server alone. A throw the server refuses never moves
 * server-side: after `timeoutS` the server pose simply wins.
 */
export interface Handover {
  preThrow: Vec3;
  /** First snapshot tick showing the piece moved, once seen. */
  movedAtTick: number | null;
  elapsedS: number;
  blendElapsedS: number | null;
  /** The server tick that started the flight (its `thrown` reply), once
   * known: the stick is then shown on the THROW's own time line —
   * flight time since release — instead of 100 ms in the past. */
  serverStartTick: number | null;
}

/** Server-side movement smaller than this is not the throw yet. */
const MOVED_M = 0.05;

export function startHandover(serverPoseAtRelease: Vec3): Handover {
  return {
    preThrow: [...serverPoseAtRelease],
    movedAtTick: null,
    elapsedS: 0,
    blendElapsedS: null,
    serverStartTick: null,
  };
}

/** The server says which tick started the flight. */
export function noteThrowStarted(h: Handover, tick: number): void {
  h.serverStartTick ??= tick;
}

/** Call for every arriving snapshot containing the piece. */
export function noteServerPose(
  h: Handover,
  tick: number,
  position: Vec3,
): void {
  if (h.movedAtTick !== null) {
    return;
  }
  const movedM = Math.hypot(
    position[0] - h.preThrow[0],
    position[1] - h.preThrow[1],
    position[2] - h.preThrow[2],
  );
  if (movedM > MOVED_M) {
    h.movedAtTick = tick;
  }
}

/**
 * `tick` (when set) is the time line to show the piece on — the throw's
 * own, ahead of the snapshots (SnapshotBuffer.sampleAhead); null means
 * the usual interpolated render time.
 */
export type HandoverStep =
  | { kind: 'local' }
  | { kind: 'blend'; t: number; tick: number | null }
  | { kind: 'follow'; tick: number }
  | { kind: 'done' };

const LOCAL: HandoverStep = { kind: 'local' };
const DONE: HandoverStep = { kind: 'done' };

/** Snapshots come every this many ticks (core/serverProtocol.ts). */
const SNAPSHOT_SPAN_TICKS = 3;

export interface HandoverOptions {
  blendS: number;
  timeoutS: number;
  tickHz: number;
  /** Newest snapshot tick. */
  latestTick: number;
  /** Give up following the throw's time line after this long. */
  followMaxS: number;
}

/**
 * Once per frame: what to show for the piece now. `converged`: the
 * render-time pose has caught up with the throw-time one (the stick has
 * come to rest) — the usual time line takes over seamlessly.
 *
 * With the server's start tick (2026-11-01, Erik: "precis när jag
 * släpper pinnen … laggar till"): the local prediction runs until two
 * snapshots of the flight exist (extrapolation needs a velocity; the
 * one before the throw shows the stick in its rack), then the stick
 * follows the throw's time line until it lands and settles. Blending onto the delayed render time instead pulled the
 * stick ~0.5 m BACK just after release (a 7 m/s throw, 100 ms delay).
 * Without a start tick (an older server, a refused throw) it falls back
 * to the render-time handover below.
 */
export function advanceHandover(
  h: Handover,
  renderTick: number,
  dtS: number,
  opts: HandoverOptions,
  converged = false,
): HandoverStep {
  h.elapsedS += dtS;
  if (h.serverStartTick !== null) {
    if (opts.latestTick < h.serverStartTick + 2 * SNAPSHOT_SPAN_TICKS) {
      return h.elapsedS > opts.timeoutS ? DONE : LOCAL;
    }
    // Straight onto the throw's time line — no blend: it is the same
    // flight at the same moment (within ~10 cm, under one frame of
    // motion), and a blend from the last drawn pose lagged a fast stick.
    return converged || h.elapsedS > opts.followMaxS
      ? DONE
      : { kind: 'follow', tick: h.serverStartTick + h.elapsedS * opts.tickHz };
  }
  if (h.blendElapsedS === null) {
    if (h.movedAtTick === null || renderTick < h.movedAtTick) {
      return h.elapsedS > opts.timeoutS ? DONE : LOCAL;
    }
    h.blendElapsedS = 0;
    return { kind: 'blend', t: 0, tick: null };
  }
  h.blendElapsedS += dtS;
  const t = h.blendElapsedS / opts.blendS;
  return t >= 1 ? DONE : { kind: 'blend', t, tick: null };
}
