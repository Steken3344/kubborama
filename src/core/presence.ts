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
