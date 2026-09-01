import { z } from 'zod';
import { quaternionSchema, vec3Schema } from './networkSchemas.js';

/**
 * MP2 (docs/PLAN.md §10, Erik's 2026-09-01 decisions): the host
 * broadcasts the shared court's authoritative piece transforms — king,
 * both kubb baselines, and every stick — at ~20 Hz. A stick's initial
 * throw is relayed separately (see core/throwRelay.ts) since it needs
 * velocity, not just a transform; once flying/settled it's just
 * another periodically-synced piece like this. Network messages are
 * an untrusted boundary (CLAUDE.md): malformed data is dropped, never
 * trusted.
 */
export const PIECE_SYNC_SCHEMA_VERSION = 1;

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
