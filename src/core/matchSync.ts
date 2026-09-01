import { z } from 'zod';
import type { MatchState } from './match.js';

/**
 * MP2 phase 3: the host is authoritative for match/turn state (same
 * "först in äger spelet" model as core/pieceSync.ts), broadcast
 * event-driven (on a kubb felled / turn advanced) rather than at
 * ~20 Hz — match state changes rarely, unlike a physics transform.
 * Network messages are an untrusted boundary (CLAUDE.md): malformed
 * data is dropped, never trusted.
 */
export const MATCH_SYNC_SCHEMA_VERSION = 1;

const matchSideSchema = z.enum(['host', 'guest']);

const matchStateSchema = z.object({
  currentTurn: matchSideSchema,
  hostKubbsRemaining: z.number().int().min(0),
  guestKubbsRemaining: z.number().int().min(0),
  winner: matchSideSchema.nullable(),
});

const matchSyncMessageSchema = z.object({
  version: z.literal(MATCH_SYNC_SCHEMA_VERSION),
  state: matchStateSchema,
});
export type MatchSyncMessage = z.infer<typeof matchSyncMessageSchema>;

export function buildMatchSyncMessage(state: MatchState): MatchSyncMessage {
  return { version: MATCH_SYNC_SCHEMA_VERSION, state };
}

/** Never throws — see core/presence.ts's parsePresenceMessage for the
 * same untrusted-network-boundary rationale. */
export function parseMatchSyncMessage(data: unknown): MatchSyncMessage | null {
  const result = matchSyncMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}
