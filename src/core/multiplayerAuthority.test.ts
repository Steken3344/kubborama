import { describe, expect, it } from 'vitest';
import {
  isHost,
  parseHelloMessage,
  resolveHostId,
} from './multiplayerAuthority.js';
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

describe('resolveHostId', () => {
  it('names self when alone', () => {
    expect(resolveHostId({ id: 'a', joinedAtMs: 1000 }, [])).toBe('a');
  });

  it('names the earliest-joined peer, not always self', () => {
    const self: PeerJoinInfo = { id: 'a', joinedAtMs: 2000 };
    const peers: PeerJoinInfo[] = [{ id: 'b', joinedAtMs: 1500 }];
    expect(resolveHostId(self, peers)).toBe('b');
  });

  it('agrees with isHost on who won', () => {
    const self: PeerJoinInfo = { id: 'a', joinedAtMs: 1500 };
    const peerB: PeerJoinInfo = { id: 'b', joinedAtMs: 2000 };
    const peerC: PeerJoinInfo = { id: 'c', joinedAtMs: 1000 };
    expect(resolveHostId(self, [peerB, peerC])).toBe('c');
    expect(isHost(self, [peerB, peerC])).toBe(false);
    expect(isHost(peerC, [self, peerB])).toBe(true);
  });
});

describe('parseHelloMessage', () => {
  it('accepts a well-formed hello', () => {
    expect(parseHelloMessage({ joinedAtMs: 12345 })).toEqual({
      joinedAtMs: 12345,
    });
  });

  it('rejects an empty payload rather than defaulting joinedAtMs to 0', () => {
    expect(parseHelloMessage({})).toBeNull();
  });

  it('rejects a non-numeric joinedAtMs', () => {
    expect(parseHelloMessage({ joinedAtMs: '0' })).toBeNull();
  });

  it('rejects zero, negative, and non-integer timestamps', () => {
    expect(parseHelloMessage({ joinedAtMs: 0 })).toBeNull();
    expect(parseHelloMessage({ joinedAtMs: -1 })).toBeNull();
    expect(parseHelloMessage({ joinedAtMs: 1.5 })).toBeNull();
  });

  it('rejects a non-object payload', () => {
    expect(parseHelloMessage(null)).toBeNull();
    expect(parseHelloMessage('hello')).toBeNull();
  });
});
