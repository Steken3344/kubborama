import { z } from 'zod';
import { quaternionSchema, vec3Schema } from './networkSchemas.js';

/**
 * MP2 phase 2 (Erik, 2026-09-01: "both should be able to throw"):
 * once kubbs/king are host-authoritative (core/pieceSync.ts), a
 * guest's own local throw physics can't be authoritative for a stick
 * either — the guest's release has to become a request the host
 * applies to ITS copy of that stick, the same way
 * systems/throwing.ts's `onRelease()` already applies a LOCAL throw
 * (`PhysicsSystem.setBodyTransform` + a one-shot `PhysicsManipulation`
 * component). The guest's own local stick keeps flying too (untouched
 * — this file changes nothing about `ThrowingSystem`), giving
 * immediate local feedback while core/pieceSync.ts's regular broadcast
 * gradually reconciles it to the host's authoritative trajectory once
 * released (client-side prediction + server reconciliation, the
 * standard pattern for exactly this problem).
 */
export const THROW_RELAY_SCHEMA_VERSION = 1;

const throwRelaySchema = z.object({
  version: z.literal(THROW_RELAY_SCHEMA_VERSION),
  stickId: z.string(),
  position: vec3Schema,
  quaternion: quaternionSchema,
  linearVelocity: vec3Schema,
  angularVelocity: vec3Schema,
  // Which hand released the stick — carried through so the host's
  // applied copy sets StickState.lastThrowerHand correctly (code
  // review, 2026-09-02: without this, a stick thrown locally by the
  // host earlier and later reused by the guest kept the HOST's own
  // last hand, misattributing impact haptics to the wrong controller).
  hand: z.enum(['left', 'right']),
});
export type ThrowRelayMessage = z.infer<typeof throwRelaySchema>;

export function buildThrowRelayMessage(
  input: Omit<ThrowRelayMessage, 'version'>,
): ThrowRelayMessage {
  return { version: THROW_RELAY_SCHEMA_VERSION, ...input };
}

/** Never throws — see core/presence.ts's parsePresenceMessage for the
 * same untrusted-network-boundary rationale. */
export function parseThrowRelayMessage(
  data: unknown,
): ThrowRelayMessage | null {
  const result = throwRelaySchema.safeParse(data);
  return result.success ? result.data : null;
}
