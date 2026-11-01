import { detectImpact } from './impactDetector.js';
import type { Vec3 } from './vec3.js';

/**
 * Impacts seen by the authoritative game server (2026-11-01: since the
 * own stick follows the server's time line after release, no client
 * runs physics on a flying stick any more, so a stick landing or
 * striking a kubb made no sound at all — and the bot's never had).
 * The server watches every networked piece's velocity after each fixed
 * step with the clients' own |Δv| heuristic (core/impactDetector.ts) and
 * sends what it finds; clients play the sound and the haptics.
 *
 * A teleport (re-rack, raise, the jump to a release point) is not an
 * impact: a piece that moved further in one step than its speed allows
 * plus `teleportM` is skipped. `cooldownS` keeps one contact from
 * reporting every step while it settles. Plain data, allocation only on
 * a piece's first sight.
 */
export interface ImpactItem {
  id: string;
  deltaVMps: number;
  position: Vec3;
}

export interface ImpactWatchOptions {
  thresholdMps: number;
  teleportM: number;
  cooldownS: number;
}

interface Track {
  position: Vec3;
  velocity: Vec3;
  lastImpactS: number;
}

export function createImpactWatch(opts: ImpactWatchOptions) {
  const tracks = new Map<string, Track>();
  return {
    /** One piece after a step of `dtS` ending at `nowS`; an impact is
     * appended to `out`. */
    observe(
      id: string,
      position: Vec3,
      velocity: Vec3,
      nowS: number,
      dtS: number,
      out: ImpactItem[],
    ): void {
      const track = tracks.get(id);
      if (!track) {
        tracks.set(id, {
          position: [...position],
          velocity: [...velocity],
          lastImpactS: -Infinity,
        });
        return;
      }
      const movedM = Math.hypot(
        position[0] - track.position[0],
        position[1] - track.position[1],
        position[2] - track.position[2],
      );
      const reachM =
        Math.max(Math.hypot(...velocity), Math.hypot(...track.velocity)) * dtS +
        opts.teleportM;
      if (movedM <= reachM) {
        const { isImpact, deltaVMps } = detectImpact(
          track.velocity,
          velocity,
          opts.thresholdMps,
        );
        if (isImpact && nowS - track.lastImpactS >= opts.cooldownS) {
          track.lastImpactS = nowS;
          out.push({ id, deltaVMps, position: [...position] });
        }
      }
      for (let i = 0; i < 3; i++) {
        track.position[i] = position[i] ?? 0;
        track.velocity[i] = velocity[i] ?? 0;
      }
    },
    /** Forget everything (a new physics world). */
    reset(): void {
      tracks.clear();
    },
  };
}

export type ImpactWatch = ReturnType<typeof createImpactWatch>;
