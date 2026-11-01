import type { Quat } from './quat.js';
import type { Vec3 } from './vec3.js';

/**
 * A held stick sits in the hand by its END (Erik, 2026-11-01: "när jag
 * plockar upp … pinnen svävar och inte riktigt känns som man håller i
 * den" — he chose "the end in the hand"). IWSDK's one-hand grab keeps
 * whatever offset the stick had when grabbed; instead the stick is laid
 * into the grip every frame: one end `holdFromEndM` inside the fist, the
 * shaft pointing along the controller (its −Z) tilted `pitchDownDeg`
 * down, like a kubb stick held for an underhand throw. Writes into
 * `out` — it runs every frame and must not allocate.
 *
 * The stick's long axis is its local +Y (a cylinder centred on its
 * origin, src/scene-assets/stick.scene-asset.ts).
 */
export interface StickGripOptions {
  lengthM: number;
  holdFromEndM: number;
  pitchDownDeg: number;
}

export function stickInHand(
  gripPosition: Vec3,
  gripQuaternion: Quat,
  opts: StickGripOptions,
  out: { position: Vec3; quaternion: Quat },
): void {
  // The shaft's direction in grip space: forward (−Z), pitched down.
  const pitchRad = (opts.pitchDownDeg * Math.PI) / 180;
  const lx = 0;
  const ly = -Math.sin(pitchRad);
  const lz = -Math.cos(pitchRad);
  // Rotate it into the world: v' = v + 2w(q×v) + 2q×(q×v).
  const [qx, qy, qz, qw] = gripQuaternion;
  const cx = qy * lz - qz * ly;
  const cy = qz * lx - qx * lz;
  const cz = qx * ly - qy * lx;
  const dx = lx + 2 * (qw * cx + (qy * cz - qz * cy));
  const dy = ly + 2 * (qw * cy + (qz * cx - qx * cz));
  const dz = lz + 2 * (qw * cz + (qx * cy - qy * cx));
  // The stick's centre: half a length minus the held bit from the fist.
  const reachM = opts.lengthM / 2 - opts.holdFromEndM;
  out.position[0] = gripPosition[0] + dx * reachM;
  out.position[1] = gripPosition[1] + dy * reachM;
  out.position[2] = gripPosition[2] + dz * reachM;
  // The shortest rotation taking +Y onto (dx, dy, dz).
  const w = 1 + dy;
  if (w < 1e-6) {
    out.quaternion[0] = 1; // pointing straight down: half a turn about X
    out.quaternion[1] = 0;
    out.quaternion[2] = 0;
    out.quaternion[3] = 0;
    return;
  }
  const length = Math.hypot(dz, dx, w);
  out.quaternion[0] = dz / length;
  out.quaternion[1] = 0;
  out.quaternion[2] = -dx / length;
  out.quaternion[3] = w / length;
}
