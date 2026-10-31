import type { PieceTransform } from './pieceSync.js';
import { slerpInto } from './quat.js';
import type { Quat } from './quat.js';
import type { Vec3 } from './vec3.js';

/**
 * Smooth piece motion from the game server's 20 Hz snapshots (Erik,
 * 2026-10-31: "de ser väldigt hackigt ut när de snurrar i luften").
 * Applying each snapshot as it arrives makes a stick spinning ~20 rad/s
 * jump ~60° every 50 ms. Instead the client renders a little in the
 * PAST — `delayTicks` behind the newest snapshot — and interpolates
 * between the two snapshots around that moment: position linearly,
 * rotation by slerp. Standard entity interpolation: a fixed, small
 * extra latency buys motion as smooth as the frame rate, and the delay
 * absorbs Wi-Fi jitter (a late snapshot is still in the future of the
 * render time).
 */

/** Faster than this between snapshots (m per server tick = 30 m/s at
 * 60 Hz — no throw gets near it) is a teleport (rack reset, court
 * switch): jump, never sweep a stick through the air. */
const TELEPORT_M_PER_TICK = 0.5;

interface Snapshot {
  tick: number;
  pieces: Map<string, PieceTransform>;
}

export class SnapshotBuffer {
  /** Oldest first. */
  private snapshots: Snapshot[] = [];

  constructor(private readonly capacity = 8) {}

  push(tick: number, pieces: readonly PieceTransform[]): void {
    const latest = this.latestTick();
    if (latest !== null && tick <= latest) {
      return; // out of order or repeated — the newer one already counts
    }
    this.snapshots.push({
      tick,
      pieces: new Map(pieces.map((p) => [p.id, p])),
    });
    if (this.snapshots.length > this.capacity) {
      this.snapshots.shift();
    }
  }

  /** A new server session (rejoin, restart) counts ticks from scratch. */
  reset(): void {
    this.snapshots = [];
  }

  latestTick(): number | null {
    return this.snapshots[this.snapshots.length - 1]?.tick ?? null;
  }

  /** The newest snapshot's piece ids, in order. */
  latestIds(): IterableIterator<string> | undefined {
    return this.snapshots[this.snapshots.length - 1]?.pieces.keys();
  }

  /** `id`'s position in the newest snapshot, if any. */
  latestPosition(id: string): Vec3 | null {
    const pose = this.snapshots[this.snapshots.length - 1]?.pieces.get(id);
    return pose ? pose.position : null;
  }

  /** Writes `id`'s pose at `renderTick` into `out`; false if unknown. */
  sample(
    id: string,
    renderTick: number,
    out: { position: Vec3; quaternion: Quat },
  ): boolean {
    let before: PieceTransform | undefined;
    let beforeTick = 0;
    for (const snapshot of this.snapshots) {
      const pose = snapshot.pieces.get(id);
      if (!pose) {
        continue;
      }
      if (snapshot.tick <= renderTick) {
        before = pose;
        beforeTick = snapshot.tick;
        continue;
      }
      // `snapshot` is the first one after the render time.
      if (!before) {
        copy(pose, out); // render time older than the history: hold
        return true;
      }
      const spanTicks = snapshot.tick - beforeTick;
      const jumpM = Math.hypot(
        pose.position[0] - before.position[0],
        pose.position[1] - before.position[1],
        pose.position[2] - before.position[2],
      );
      if (jumpM > TELEPORT_M_PER_TICK * spanTicks) {
        copy(pose, out);
        return true;
      }
      const t = (renderTick - beforeTick) / spanTicks;
      for (let i = 0; i < 3; i++) {
        const a = before.position[i] ?? 0;
        const b = pose.position[i] ?? 0;
        out.position[i] = a + (b - a) * t;
      }
      slerpInto(before.quaternion, pose.quaternion, t, out.quaternion);
      return true;
    }
    if (!before) {
      return false;
    }
    copy(before, out); // past the newest snapshot: hold, never guess
    return true;
  }
}

function copy(
  from: PieceTransform,
  out: { position: Vec3; quaternion: Quat },
): void {
  out.position[0] = from.position[0];
  out.position[1] = from.position[1];
  out.position[2] = from.position[2];
  out.quaternion[0] = from.quaternion[0];
  out.quaternion[1] = from.quaternion[1];
  out.quaternion[2] = from.quaternion[2];
  out.quaternion[3] = from.quaternion[3];
}

/** Gaps (ticks) beyond this snap the clock instead of drifting. */
const MAX_DRIFT_TICKS = 30;
/** Drift correction rate (1/s): the remaining error decays as
 * exp(−rate·t), the same at 72 and 90 fps (≈ 5 % per frame at 60). */
const DRIFT_RATE_PER_S = 3;

/**
 * The render time, in server ticks: advances with the local frame clock
 * and drifts gently toward `latestTick − delayTicks`, so uneven snapshot
 * arrival never shows as a stutter; a large gap (first snapshot, a
 * reconnect) snaps it.
 */
export class InterpolationClock {
  private tick: number | null = null;

  advance(
    dtS: number,
    latestTick: number,
    tickHz: number,
    delayTicks: number,
  ): number {
    const target = latestTick - delayTicks;
    if (this.tick === null || Math.abs(target - this.tick) > MAX_DRIFT_TICKS) {
      this.tick = target;
      return target;
    }
    const advanced = this.tick + dtS * tickHz;
    const gain = 1 - Math.exp(-DRIFT_RATE_PER_S * dtS);
    this.tick = advanced + (target - advanced) * gain;
    return this.tick;
  }

  reset(): void {
    this.tick = null;
  }
}
