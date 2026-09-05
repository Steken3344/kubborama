import { z } from 'zod';
import { quaternionSchema, vec3Schema } from './networkSchemas.js';
import type { Vec3 } from './vec3.js';

/**
 * MP1 co-presence (docs/PLAN.md §10): what one player broadcasts to
 * the other every tick — head + both hands, nothing else. No
 * simulated-piece state yet (that's MP2's shared-match authority
 * model); this is presence only.
 */
/** v2 (MP3b, 2026-09-05): `colorIndex` — the sender's chosen avatar
 * palette index. Both headsets run the same deploy; a v1 peer is simply
 * dropped by safeParse below, as any mismatch always was. */
export const PRESENCE_SCHEMA_VERSION = 2;

/** Generous upper bound, not the palette length — core must not import
 * config; the receiver clamps onto the real palette (config.ts's
 * avatarPaletteEntry). */
export const MAX_COLOR_INDEX = 15;

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
  colorIndex: z.number().int().min(0).max(MAX_COLOR_INDEX),
});
export type PresenceMessage = z.infer<typeof presenceMessageSchema>;

export function defaultPose(): Pose {
  return { position: [0, 0, 0] as Vec3, quaternion: [0, 0, 0, 1] };
}

export function buildPresenceMessage(input: {
  head: Pose;
  leftHand: Pose;
  rightHand: Pose;
  colorIndex: number;
}): PresenceMessage {
  // Clamp at the SEND side (code review, 2026-09-05): a stale or
  // hand-edited settings index ≥ 16 would otherwise make every presence
  // message this player sends fail the receiver's schema — no avatar at
  // all, and nothing visibly wrong locally. The invariant lives with the
  // schema so the two can never drift apart.
  const colorIndex = Math.min(
    Math.max(0, Math.trunc(input.colorIndex)),
    MAX_COLOR_INDEX,
  );
  return { version: PRESENCE_SCHEMA_VERSION, ...input, colorIndex };
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
