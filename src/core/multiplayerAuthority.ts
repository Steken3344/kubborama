export interface PeerJoinInfo {
  id: string;
  joinedAtMs: number;
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
 */
export function isHost(self: PeerJoinInfo, peers: PeerJoinInfo[]): boolean {
  for (const peer of peers) {
    if (peer.joinedAtMs < self.joinedAtMs) {
      return false;
    }
    if (peer.joinedAtMs === self.joinedAtMs && peer.id < self.id) {
      return false;
    }
  }
  return true;
}
