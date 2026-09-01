import { z } from 'zod';
import type { Vec3 } from './vec3.js';

/**
 * MP1 co-presence (docs/PLAN.md §10): what one player broadcasts to
 * the other every tick — head + both hands, nothing else. No
 * simulated-piece state yet (that's MP2's shared-match authority
 * model); this is presence only.
 */
export const PRESENCE_SCHEMA_VERSION = 1;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const quaternionSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const poseSchema = z.object({
  position: vec3Schema,
  quaternion: quaternionSchema,
});
export type Pose = z.infer<typeof poseSchema>;

const presenceMessageSchema = z.object({
  version: z.literal(PRESENCE_SCHEMA_VERSION),
  head: poseSchema,
  leftHand: poseSchema,
  rightHand: poseSchema,
});
export type PresenceMessage = z.infer<typeof presenceMessageSchema>;

export function defaultPose(): Pose {
  return { position: [0, 0, 0] as Vec3, quaternion: [0, 0, 0, 1] };
}

export function buildPresenceMessage(input: {
  head: Pose;
  leftHand: Pose;
  rightHand: Pose;
}): PresenceMessage {
  return { version: PRESENCE_SCHEMA_VERSION, ...input };
}

/** Never throws — a peer on a mismatched schema version or sending
 * malformed data is silently ignored, not trusted (network messages
 * are an untrusted boundary, CLAUDE.md). */
export function parsePresenceMessage(data: unknown): PresenceMessage | null {
  const result = presenceMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * Erik's 2026-09-01 decision (resolves MP1's "known limitation" from
 * the first implementation): the other headset spawns at the FAR
 * baseline — the one you normally throw at — facing back toward you,
 * rather than at a generic sideways offset. Every peer sends its own
 * poses in its own local space (peer origin (0,0,0), facing -Z, same
 * convention as the local player per CLAUDE.md); this rotates that
 * whole local space 180° around Y and translates it to the far
 * baseline, so both players end up facing each other across the court
 * — a real "each player at their own baseline" placement, not a
 * cosmetic shift. Pure closed-form math (no three.js Quaternion
 * needed): 180°-around-Y composed with any quaternion (x,y,z,w) is
 * exactly (z,w,-x,-y) — verified against the identity case (facing -Z
 * mirrors to facing +Z, i.e. the 180° rotation itself).
 */
export function mirrorPoseToFarBaseline(pose: Pose, farZ: number): Pose {
  const [x, y, z] = pose.position;
  const [qx, qy, qz, qw] = pose.quaternion;
  return {
    // `-0 || 0` avoids a real-but-meaningless negative zero at x=0.
    position: [-x || 0, y, farZ - z],
    quaternion: [qz, qw, -qx || 0, -qy || 0],
  };
}
