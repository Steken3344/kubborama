import { z } from 'zod';
import type { MatchState } from './match.js';

/**
 * MP2 phase 3 / MP3a: the host is authoritative for match state (same
 * "först in äger spelet" model as core/pieceSync.ts), broadcast
 * event-driven rather than at ~20 Hz. Network messages are an untrusted
 * boundary (CLAUDE.md): malformed data is dropped, never trusted.
 *
 * v2 (MP3a, 2026-09-05): per-side felled-kubb id lists replace the two
 * remaining-counters, `endReason` added. v1 is rejected; with the PWA's
 * autoUpdate one headset can briefly run the old build until it
 * reloads, so the receiver logs a distinct version-mismatch warning
 * (see peekSchemaVersion) instead of a generic "malformed".
 */
export const MATCH_SYNC_SCHEMA_VERSION = 2;

const matchSideSchema = z.enum(['host', 'guest']);

const matchStateSchema = z.object({
  currentTurn: matchSideSchema,
  felledKubbIds: z.object({
    host: z.array(z.string()),
    guest: z.array(z.string()),
  }),
  winner: matchSideSchema.nullable(),
  endReason: z.enum(['allKubbsAndKing', 'kingFelledEarly']).nullable(),
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

const versionOnlySchema = z.object({ version: z.number() });

/** The `version` of an otherwise-unvalidated message, for a targeted
 * "schema mismatch" log — null when there is no numeric version. */
export function peekSchemaVersion(data: unknown): number | null {
  const result = versionOnlySchema.safeParse(data);
  return result.success ? result.data.version : null;
}
