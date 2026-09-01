import { describe, expect, it } from 'vitest';
import {
  initialMatchState,
  kubbSide,
  otherSide,
  withKubbFelled,
  withTurnAdvanced,
} from './match.js';

describe('initialMatchState', () => {
  it('starts with the host on turn, no winner, full kubb counts', () => {
    const state = initialMatchState(5);
    expect(state).toEqual({
      currentTurn: 'host',
      hostKubbsRemaining: 5,
      guestKubbsRemaining: 5,
      winner: null,
    });
  });
});

describe('otherSide', () => {
  it('flips host <-> guest', () => {
    expect(otherSide('host')).toBe('guest');
    expect(otherSide('guest')).toBe('host');
  });
});

describe('kubbSide', () => {
  it('maps the far baseline (low indices) to guest', () => {
    expect(kubbSide(0, 5)).toBe('guest');
    expect(kubbSide(4, 5)).toBe('guest');
  });

  it('maps the near baseline (high indices) to host', () => {
    expect(kubbSide(5, 5)).toBe('host');
    expect(kubbSide(9, 5)).toBe('host');
  });

  it('returns null for an out-of-range index', () => {
    expect(kubbSide(-1, 5)).toBeNull();
    expect(kubbSide(10, 5)).toBeNull();
  });
});

describe('withKubbFelled', () => {
  it('decrements the felled side count', () => {
    const state = withKubbFelled(initialMatchState(5), 'host');
    expect(state.hostKubbsRemaining).toBe(4);
    expect(state.guestKubbsRemaining).toBe(5);
    expect(state.winner).toBeNull();
  });

  it('declares the OTHER side the winner once a side reaches zero', () => {
    let state = initialMatchState(1);
    state = withKubbFelled(state, 'host');
    expect(state.hostKubbsRemaining).toBe(0);
    expect(state.winner).toBe('guest');
  });

  it('is a no-op once a winner is already decided', () => {
    let state = initialMatchState(1);
    state = withKubbFelled(state, 'host');
    const afterWin = withKubbFelled(state, 'guest');
    expect(afterWin).toEqual(state);
  });

  it('is a no-op if that side is already at zero (defensive, no double-count)', () => {
    let state = initialMatchState(1);
    state = withKubbFelled(state, 'host');
    const stillHostAtZero = { ...state, winner: null };
    const result = withKubbFelled(stillHostAtZero, 'host');
    expect(result.hostKubbsRemaining).toBe(0);
  });
});

describe('withTurnAdvanced', () => {
  it('flips the current turn', () => {
    const state = withTurnAdvanced(initialMatchState(5));
    expect(state.currentTurn).toBe('guest');
    expect(withTurnAdvanced(state).currentTurn).toBe('host');
  });

  it('is a no-op once a winner is decided', () => {
    let state = initialMatchState(1);
    state = withKubbFelled(state, 'host');
    expect(withTurnAdvanced(state).currentTurn).toBe(state.currentTurn);
  });
});
