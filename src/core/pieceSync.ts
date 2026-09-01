import { z } from 'zod';

/**
 * MP2 phase 1 (docs/PLAN.md §10, Erik's 2026-09-01 decisions): the
 * host broadcasts the shared court's authoritative piece transforms —
 * king + both kubb baselines for now. Sticks stay MP1-local (each
 * player's own set, unnetworked) until phase 2 relays a guest's throw
 * through the host's physics — see systems/multiplayer.ts's class doc
 * for the full phased plan. Network messages are an untrusted
 * boundary (CLAUDE.md): malformed data is dropped, never trusted.
 */
export const PIECE_SYNC_SCHEMA_VERSION = 1;

const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const quaternionSchema = z.tuple([
  z.number(),
  z.number(),
  z.number(),
  z.number(),
]);

const pieceTransformSchema = z.object({
  id: z.string(),
  position: vec3Schema,
  quaternion: quaternionSchema,
});
export type PieceTransform = z.infer<typeof pieceTransformSchema>;

const pieceSyncMessageSchema = z.object({
  version: z.literal(PIECE_SYNC_SCHEMA_VERSION),
  pieces: z.array(pieceTransformSchema),
});
export type PieceSyncMessage = z.infer<typeof pieceSyncMessageSchema>;

export function buildPieceSyncMessage(
  pieces: PieceTransform[],
): PieceSyncMessage {
  return { version: PIECE_SYNC_SCHEMA_VERSION, pieces };
}

/** Never throws — see core/presence.ts's parsePresenceMessage for the
 * same untrusted-network-boundary rationale. */
export function parsePieceSyncMessage(data: unknown): PieceSyncMessage | null {
  const result = pieceSyncMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
