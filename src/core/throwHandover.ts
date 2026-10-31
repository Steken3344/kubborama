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
}

/** Server-side movement smaller than this is not the throw yet. */
const MOVED_M = 0.05;

export function startHandover(serverPoseAtRelease: Vec3): Handover {
  return {
    preThrow: [...serverPoseAtRelease],
    movedAtTick: null,
    elapsedS: 0,
    blendElapsedS: null,
  };
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

export type HandoverStep =
  { kind: 'local' } | { kind: 'blend'; t: number } | { kind: 'done' };

/** Once per frame: what to show for the piece now. */
export function advanceHandover(
  h: Handover,
  renderTick: number,
  dtS: number,
  opts: { blendS: number; timeoutS: number },
): HandoverStep {
  h.elapsedS += dtS;
  if (h.blendElapsedS === null) {
    if (h.movedAtTick === null || renderTick < h.movedAtTick) {
      return h.elapsedS > opts.timeoutS ? { kind: 'done' } : { kind: 'local' };
    }
    h.blendElapsedS = 0;
    return { kind: 'blend', t: 0 };
  }
  h.blendElapsedS += dtS;
  const t = h.blendElapsedS / opts.blendS;
  return t >= 1 ? { kind: 'done' } : { kind: 'blend', t };
}
