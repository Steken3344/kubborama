import { describe, expect, it } from 'vitest';
import { isHost } from './multiplayerAuthority.js';
import type { PeerJoinInfo } from './multiplayerAuthority.js';

describe('isHost', () => {
  it('is host when alone in the room', () => {
    expect(isHost({ id: 'a', joinedAtMs: 1000 }, [])).toBe(true);
  });

  it('is host when it joined strictly before every peer', () => {
    const self: PeerJoinInfo = { id: 'a', joinedAtMs: 1000 };
    const peers: PeerJoinInfo[] = [{ id: 'b', joinedAtMs: 1500 }];
    expect(isHost(self, peers)).toBe(true);
  });

  it('is NOT host when it joined after a peer', () => {
    const self: PeerJoinInfo = { id: 'a', joinedAtMs: 2000 };
    const peers: PeerJoinInfo[] = [{ id: 'b', joinedAtMs: 1500 }];
    expect(isHost(self, peers)).toBe(false);
  });

  it('is NOT host if it is later than even one of several peers', () => {
    const self: PeerJoinInfo = { id: 'a', joinedAtMs: 1500 };
    const peers: PeerJoinInfo[] = [
      { id: 'b', joinedAtMs: 2000 },
      { id: 'c', joinedAtMs: 1000 },
    ];
    expect(isHost(self, peers)).toBe(false);
  });

  it('breaks an exact-timestamp tie by comparing peer ids, symmetrically', () => {
    const a: PeerJoinInfo = { id: 'a', joinedAtMs: 1000 };
    const b: PeerJoinInfo = { id: 'b', joinedAtMs: 1000 };
    expect(isHost(a, [b])).toBe(true);
    expect(isHost(b, [a])).toBe(false);
  });
});
