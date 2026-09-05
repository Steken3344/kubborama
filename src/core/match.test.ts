import { describe, expect, it } from 'vitest';
import {
  initialMatchState,
  isFinished,
  kubbIndexFromId,
  kubbSide,
  otherSide,
  score,
  withKingFelled,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';

// kubb-0..4 = guest side (far baseline), kubb-5..9 = host side (near).
const GUEST_KUBBS = ['kubb-0', 'kubb-1', 'kubb-2', 'kubb-3', 'kubb-4'];
const HOST_KUBBS = ['kubb-5', 'kubb-6', 'kubb-7', 'kubb-8', 'kubb-9'];

function afterHostFells(ids: string[]) {
  return ids.reduce((s, id) => withKubbFelled(s, id), initialMatchState());
}

describe('initialMatchState', () => {
  it('starts with the host on turn, nothing felled, no winner', () => {
    expect(initialMatchState()).toEqual({
      currentTurn: 'host',
      felledKubbIds: { host: [], guest: [] },
      winner: null,
      endReason: null,
    });
  });
});

describe('otherSide / kubbSide / kubbIndexFromId', () => {
  it('flips sides', () => {
    expect(otherSide('host')).toBe('guest');
    expect(otherSide('guest')).toBe('host');
  });
  it('maps low indices to guest, high to host, out of range to null', () => {
    expect(kubbSide(0, 5)).toBe('guest');
    expect(kubbSide(4, 5)).toBe('guest');
    expect(kubbSide(5, 5)).toBe('host');
    expect(kubbSide(9, 5)).toBe('host');
    expect(kubbSide(10, 5)).toBeNull();
  });
  it('parses scene ids and rejects anything else', () => {
    expect(kubbIndexFromId('kubb-7')).toBe(7);
    expect(kubbIndexFromId('king')).toBeNull();
    expect(kubbIndexFromId('stick-1')).toBeNull();
    expect(kubbIndexFromId('kubb-x')).toBeNull();
  });
});

describe('withKubbFelled', () => {
  it('records an opponent kubb on its side, in felling order', () => {
    const s = afterHostFells(['kubb-2', 'kubb-0']);
    expect(s.felledKubbIds.guest).toEqual(['kubb-2', 'kubb-0']);
    expect(s.felledKubbIds.host).toEqual([]);
    expect(s.winner).toBeNull();
  });
  it('ignores a duplicate id', () => {
    const s = afterHostFells(['kubb-2', 'kubb-2']);
    expect(s.felledKubbIds.guest).toEqual(['kubb-2']);
  });
  it("ignores the thrower's own-side kubb (ricochet)", () => {
    const s = withKubbFelled(initialMatchState(), 'kubb-7');
    expect(s).toEqual(initialMatchState());
  });
  it('ignores an id that is not a kubb', () => {
    expect(withKubbFelled(initialMatchState(), 'king')).toEqual(
      initialMatchState(),
    );
  });
  it('never decides the match by kubbs alone', () => {
    const s = afterHostFells(GUEST_KUBBS);
    expect(s.felledKubbIds.guest).toHaveLength(5);
    expect(s.winner).toBeNull();
    expect(isFinished(s)).toBe(false);
  });
  it('is a no-op once finished', () => {
    const finished = withKingFelled(initialMatchState());
    expect(withKubbFelled(finished, 'kubb-1')).toBe(finished);
  });
});

describe('withKingFelled', () => {
  it('king after all opponent kubbs = thrower wins', () => {
    const s = withKingFelled(afterHostFells(GUEST_KUBBS));
    expect(s.winner).toBe('host');
    expect(s.endReason).toBe('allKubbsAndKing');
    expect(isFinished(s)).toBe(true);
  });
  it('king with any opponent kubb standing = thrower loses', () => {
    const s = withKingFelled(afterHostFells(['kubb-0', 'kubb-1']));
    expect(s.winner).toBe('guest');
    expect(s.endReason).toBe('kingFelledEarly');
  });
  it('uses the current turn, not a fixed side', () => {
    let s = withTurnAdvanced(initialMatchState());
    s = HOST_KUBBS.reduce((acc, id) => withKubbFelled(acc, id), s);
    s = withKingFelled(s);
    expect(s.winner).toBe('guest');
    expect(s.endReason).toBe('allKubbsAndKing');
  });
  it('respects kubbsPerSide', () => {
    const s = withKingFelled(afterHostFells(['kubb-0']), 1);
    expect(s.winner).toBe('host');
  });
  it('is a no-op once finished', () => {
    const finished = withKingFelled(initialMatchState());
    expect(withKingFelled(finished)).toBe(finished);
  });
});

describe('withTurnAdvanced / score', () => {
  it('flips the turn and is a no-op once finished', () => {
    expect(withTurnAdvanced(initialMatchState()).currentTurn).toBe('guest');
    const finished = withKingFelled(initialMatchState());
    expect(withTurnAdvanced(finished)).toBe(finished);
  });
  it('scores each side by the OPPONENT kubbs it has felled', () => {
    let s = afterHostFells(['kubb-0', 'kubb-1']);
    s = withTurnAdvanced(s);
    s = withKubbFelled(s, 'kubb-9');
    expect(score(s)).toEqual({ host: 2, guest: 1 });
  });
});
