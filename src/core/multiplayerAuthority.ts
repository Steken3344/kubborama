import { z } from 'zod';

export interface PeerJoinInfo {
  id: string;
  joinedAtMs: number;
}

/**
 * The `hello` handshake a peer sends once on join so both sides can
 * compute isHost() below — an untrusted-network boundary like every
 * other message type (CLAUDE.md), so it needs the same zod safeParse
 * treatment. Found missing in code review (2026-09-02): an unvalidated
 * `data.joinedAtMs` let a malformed/empty hello (`{}`) fall back to 0
 * and spuriously win the "earliest timestamp" election, silently
 * flipping the real host to guest.
 *
 * HONEST LIMIT (second review, same day): this closes the
 * ACCIDENTAL/malformed path only. joinedAtMs is self-reported, so a
 * deliberately hostile peer can still send any small positive integer
 * and win the election — no schema can make a self-reported timestamp
 * trustworthy. Accepted threat model for now: the room is shared
 * between Erik's own two headsets; a hostile peer in the public lobby
 * can at worst grief a session, not corrupt anything persistent. A
 * private room code (docs/DECISIONS.md, 2026-09-02 room-privacy entry)
 * is the real mitigation if that ever matters.
 */
const helloMessageSchema = z.object({
  joinedAtMs: z.number().int().positive(),
});
export type HelloMessage = z.infer<typeof helloMessageSchema>;

export function buildHelloMessage(joinedAtMs: number): HelloMessage {
  return { joinedAtMs };
}

/** Never throws — see core/presence.ts's parsePresenceMessage for the
 * same untrusted-network-boundary rationale. */
export function parseHelloMessage(data: unknown): HelloMessage | null {
  const result = helloMessageSchema.safeParse(data);
  return result.success ? result.data : null;
}

/**
 * MP2, Erik's rule (2026-09-01): "först in äger spelet" — whichever
 * peer's local clock recorded the EARLIEST room-join time is the
 * authoritative host for the shared court state (kubbs, king).
 * Deterministic without a signaling server; stable on both sides as
 * long as clocks are roughly in sync, a safe assumption for two
 * headsets on the same Wi-Fi (both auto-NTP-synced). A same-
 * millisecond tie (astronomically unlikely, but must still resolve
 * the same way on both sides) falls back to comparing peer ids.
 *
 * Both `isHost()` and `resolveHostId()` below share this exact rule —
 * `resolveHostId()` additionally names WHICH id won, needed by a
 * client to check whether an incoming message actually came from the
 * peer it trusts as host (code review, 2026-09-02: `pieceSync` was
 * applied from ANY sender, not just the resolved host).
 */
export function isHost(self: PeerJoinInfo, peers: PeerJoinInfo[]): boolean {
  return resolveHostId(self, peers) === self.id;
}

/** Returns the id of whichever peer (self included) is host among the
 * full set. `self` is passed separately since callers already track it
 * distinctly from the peer map (see MultiplayerSystem). */
export function resolveHostId(
  self: PeerJoinInfo,
  peers: PeerJoinInfo[],
): string {
  let host = self;
  for (const peer of peers) {
    if (
      peer.joinedAtMs < host.joinedAtMs ||
      (peer.joinedAtMs === host.joinedAtMs && peer.id < host.id)
    ) {
      host = peer;
    }
  }
  return host.id;
}
